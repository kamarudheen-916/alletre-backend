import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserSignUpDTO, UserSignInDTO } from '../user/dtos';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('/sign-up')
  async userSignUpController(@Body() userSignUpBody: UserSignUpDTO) {
    return {
      success: true,
      data: await this.authService.signUp(userSignUpBody),
    };
  }

  @Post('/sign-in')
  async userSignController(@Body() UserSignInBody: UserSignInDTO) {
    return {
      success: true,
      data: await this.authService.signIn(
        UserSignInBody.email,
        UserSignInBody.password,
      ),
    };
  }
}
