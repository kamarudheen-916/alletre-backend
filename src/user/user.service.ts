import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserSignUpDTO } from './dtos/userSignup.dto';
import { NotFoundResponse, MethodNotAllowedResponse } from '../common/errors';
import { LocationDTO, UpdatePersonalInfoDTO } from './dtos';
import { FirebaseService } from 'src/firebase/firebase.service';

@Injectable()
export class UserService {
  constructor(
    private prismaService: PrismaService,
    private firebaseService: FirebaseService,
  ) {}

  async register(UserSignData: UserSignUpDTO, hashedPassword: string) {
    const { userName, email, phone } = UserSignData;

    // Check email
    const isEmailExist = await this.findUserByEmail(email);
    if (isEmailExist)
      throw new MethodNotAllowedResponse({
        ar: 'البريد الالكتروني مسجل من قبل',
        en: 'Email is already exist',
      });

    // Check phone
    const isPhoneExist = await this.findUserByPhone(phone);
    if (isPhoneExist)
      throw new MethodNotAllowedResponse({
        ar: 'الهاتف مسجل من قبل',
        en: 'Phone is already exist',
      });

    // Create User
    const user = await this._create(userName, email, hashedPassword, phone);

    return user;
  }

  async oAuth(email: string, phone: string, userName: string) {
    // Create User
    return await this.prismaService.user.create({
      data: {
        ...(email ? { email: email } : {}),
        ...(phone ? { phone: phone } : {}),
        ...(userName ? { userName: userName } : {}),
        isOAuth: true,
        isVerified: true,
      },
    });
  }

  async findUserByEmail(email: string) {
    return await this.prismaService.user.findFirst({
      where: { email: email.toLocaleLowerCase() },
    });
  }
  async findUserByPhone(phone: string) {
    return await this.prismaService.user.findFirst({
      where: { phone: phone },
    });
  }

  async checkEmailVerification(email: string) {
    const user = await this.prismaService.user.findFirst({
      where: { email: email },
    });
    return user.isVerified ? true : false;
  }

  async findUserByEmailOr404(email: string) {
    const user = await this.prismaService.user.findFirst({
      where: { email: email.toLocaleLowerCase() },
    });
    if (!user)
      throw new NotFoundResponse({
        ar: 'البريد الالكتروني غير مسجل من قبل',
        en: 'Email is not exist',
      });

    return user;
  }
  async findUserByPhoneOr404(phone: string) {
    const user = await this.prismaService.user.findFirst({
      where: { phone: phone },
    });
    if (!user)
      throw new NotFoundResponse({
        ar: 'الهاتف غبر مسجل من قبل',
        en: 'Phone is not exist',
      });
  }

  async findUserProfileByIdOr404(id: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id: id },
    });
    if (!user)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا المستخدم',
        en: 'User not found',
      });

    return this.exclude(user, ['password']);
  }

  async findUserByIdOr404(id: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id: id },
    });
    if (!user)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا المستخدم',
        en: 'User not found',
      });

    return user;
  }

  async verifyUserEmail(email: string) {
    try {
      await this.prismaService.user.update({
        where: { email: email },
        data: { isVerified: true },
      });

      return 'SUCCESS';
    } catch (error) {
      return 'FAILED';
    }
  }

  async updateUserCredentials(email: string, hashedPassword: string) {
    try {
      await this.prismaService.user.update({
        where: { email: email },
        data: { password: hashedPassword },
      });
    } catch (error) {
      console.log(error);

      throw new MethodNotAllowedResponse({
        ar: 'خطأ في تعديل بياناتك',
        en: 'Failed while updating your info',
      });
    }
  }

  async addNewLocation(userId: number, locationDTO: LocationDTO) {
    const { address, addressLabel, cityId, countryId, zipCode } = locationDTO;

    await this.prismaService.$transaction([
      this.prismaService.location.create({
        data: {
          userId: userId,
          address,
          cityId,
          countryId,
          ...(zipCode ? { zipCode } : {}),
          addressLabel,
        },
      }),

      this.prismaService.user.update({
        where: { id: userId },
        data: { hasCompletedProfile: true },
      }),
    ]);
  }

  async getAllUserLocations(userId: number) {
    return await this.prismaService.location.findMany({
      where: { userId },
      include: { country: true, city: true },
    });
  }

  async updateUserLocation(
    userId: number,
    locationId: number,
    locationDTO: LocationDTO,
  ) {
    const { address, addressLabel, cityId, countryId, zipCode } = locationDTO;

    await this._isMyLocation(userId, locationId);
    await this._isLocationRelatedToAuction(locationId);

    return await this.prismaService.location.update({
      where: { id: locationId },
      data: {
        address,
        cityId,
        countryId,
        ...(zipCode ? { zipCode } : {}),
        addressLabel,
      },
    });
  }

  async updatePersonalInfo(
    userId: number,
    updatePersonalInfoDTO: UpdatePersonalInfoDTO,
    image?: Express.Multer.File,
  ) {
    const { userName } = updatePersonalInfoDTO;
    const user = await this.findUserByIdOr404(userId);

    let uploadedImage: any;
    if (image) {
      // Delete saved Image from firebase
      if (user.imagePath)
        await this.firebaseService.deleteFileFromStorage(user.imagePath);

      // Upload new one
      uploadedImage = await this.firebaseService.uploadImage(image);
    }

    const updatedUser = await this.prismaService.user.update({
      where: { id: Number(userId) },
      data: {
        ...(uploadedImage ? { imageLink: uploadedImage.fileLink } : {}),
        ...(uploadedImage ? { imagePath: uploadedImage.filePath } : {}),
        userName,
      },
    });

    return this.exclude(updatedUser, ['password']);
  }
  private async _create(
    userName: string,
    email: string,
    hashedPassword: string,
    phone: string,
  ) {
    return await this.prismaService.user.create({
      data: {
        email: email.toLocaleLowerCase(),
        phone: phone,
        userName: userName,
        password: hashedPassword,
      },
    });
  }

  private async _isMyLocation(userId: number, locationId: number) {
    const location = await this.prismaService.location.findUnique({
      where: { id: Number(locationId) },
    });
    if (!location)
      throw new NotFoundResponse({
        ar: 'هذا العنوان غير مسجل من قبل',
        en: 'Location Is NotFound',
      });

    if (location.userId !== Number(userId))
      throw new MethodNotAllowedResponse({
        ar: 'هذا العنوان غير مصرح لك',
        en: 'You Are Not Authorized Access To Location',
      });
  }

  private async _isLocationRelatedToAuction(locationId: number) {
    const isLocationRelatedToAuction =
      await this.prismaService.auction.findFirst({
        where: { locationId: locationId },
      });
    if (isLocationRelatedToAuction)
      throw new MethodNotAllowedResponse({
        ar: 'هذا العنوان تم تعينه مع إعلان من الافضل إضافته كعنوان جديد',
        en: 'This Location Is Related To Auction, Add New One Is Better',
      });
  }

  // Exclude keys from user
  exclude<User, Key extends keyof any>(
    user: any,
    keys: Key[],
  ): Omit<User, Key> {
    for (const key of keys) {
      delete user[key];
    }
    return user;
  }
}
