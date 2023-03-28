import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OwnerGuard } from '../../auth/guards/owner.guard';
import { Account } from 'src/auth/decorators/account.decorator';
import { UserAuctionsService } from '../services/user-auctions.service';
import {
  AuctionCreationDTO,
  GetAuctionsByOwnerDTO,
  GetAuctionsDTO,
  ProductDTO,
} from '../dtos';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthOrGuestGuard } from 'src/auth/guards/authOrGuest.guard';
import { Role } from 'src/auth/enums/role.enum';

@Controller('auctions')
export class AuctionsController {
  constructor(private userAuctionsService: UserAuctionsService) {}

  @Post('')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      dest: 'uploads/',
    }),
  )
  async publishAuctionController(
    @Account() account: any,
    @Body() auctionCreationDTO: AuctionCreationDTO,
    @UploadedFiles() images: Array<Express.Multer.File>,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.createPendingAuction(
        account.id,
        auctionCreationDTO,
        images,
      ),
    };
  }

  @Post('save-draft')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      dest: 'uploads/',
    }),
  )
  async saveAuctionAsDraftController(
    @Account() account: any,
    @Body() productDTO: ProductDTO,
    @UploadedFiles() images: Array<Express.Multer.File>,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.createDraftAuction(
        account.id,
        productDTO,
        images,
      ),
    };
  }

  @Get('/user')
  @UseGuards(AuthOrGuestGuard)
  async getAuctions(
    @Account() account: any,
    @Query() getAuctionsDTO: GetAuctionsDTO,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findAuctionsForUser(
        account.roles,
        getAuctionsDTO,
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      );

    return {
      success: true,
      pagination: auctionsPaginated.pagination,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/user/ownes')
  @UseGuards(AuthGuard)
  async getAuctionsByOwner(
    @Account() account: any,
    @Query() getAuctionsByOwnerDTO: GetAuctionsByOwnerDTO,
  ) {
    const userAuctionsPaginated =
      await this.userAuctionsService.findUserOwnesAuctions(
        account.id,
        getAuctionsByOwnerDTO,
      );

    return {
      success: true,
      pagination: userAuctionsPaginated.pagination,
      data: userAuctionsPaginated.userAuctions,
    };
  }

  @Get('/user/ownes/analytics')
  @UseGuards(AuthGuard)
  async getAuctionsAnalytics(@Account() account: any) {
    const auctionsAnalytics =
      await this.userAuctionsService.findAuctionsAnalyticsForOwner(account.id);

    return {
      success: true,
      totalItems: auctionsAnalytics.count,
      data: auctionsAnalytics.auctionsGrouping,
    };
  }

  @Get('/user/:auctionId')
  @UseGuards(AuthGuard, OwnerGuard)
  async getOwnesAuctionById(
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.findOwnerAuctionByIdOr404(auctionId),
    };
  }

  @Delete('/user/:auctionId')
  @UseGuards(AuthGuard, OwnerGuard)
  async deleteAuctionByOwnerController(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.deleteDraftedAuction(
        Number(account.id),
        auctionId,
      ),
    };
  }

  @Get('/user/:auctionId/details')
  @UseGuards(AuthOrGuestGuard)
  async getAuctionById(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.findAuctionByIdOr404(
        auctionId,
        account.roles,
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      ),
    };
  }

  @Put('/user/:auctionId/details')
  @UseGuards(AuthGuard, OwnerGuard)
  async updateAuctionDetails() {}

  @Post('/user/:auctionId/make-bid')
  @UseGuards(AuthGuard)
  async makeBidByUser() {}

  @Get('/user/:auctionId/view-bides')
  @UseGuards(AuthGuard)
  async viewAuctionBides() {}
}
