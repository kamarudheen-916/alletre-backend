import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import { Role } from '../enums/role.enum';

@Injectable()
export class AuthOrGuestGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (!request.headers.authorization) {
      request.account = { roles: [Role.Guest] };
      return true;
    }

    request.account = this.validateAccessToken(request.headers.authorization);
    return true;
  }

  validateAccessToken(accessToken: string) {
    if (accessToken.split(' ')[0] !== 'Bearer')
      throw new ForbiddenException('Invalid token');

    const token = accessToken.split(' ')[1];
    try {
      const decoded = verify(token, process.env.ACCESS_TOKEN_SECRET);
      return decoded;
    } catch (err) {
      const message = `Token error: ${err.message || err.name}`;
      throw new ForbiddenException(message);
    }
  }
}