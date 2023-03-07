import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class LocationDTO {
  @IsNotEmpty()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  countryId: number;

  @IsNotEmpty()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  cityId: number;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsString()
  addressLabel: string;

  @IsOptional()
  @IsString()
  zipCode: string;
}
