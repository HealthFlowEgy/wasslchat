import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم',
  })
  password: string;

  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @MinLength(2, { message: 'الاسم الأول يجب أن يكون حرفين على الأقل' })
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Mohamed' })
  @IsString()
  @MinLength(2, { message: 'الاسم الأخير يجب أن يكون حرفين على الأقل' })
  @MaxLength(50)
  lastName: string;

  @ApiPropertyOptional({ example: '+201234567890' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'رقم الهاتف غير صالح' })
  phone?: string;

  @ApiProperty({ example: 'My Store' })
  @IsString()
  @MinLength(2, { message: 'اسم المنشأة يجب أن يكون حرفين على الأقل' })
  @MaxLength(100)
  businessName: string;

  @ApiPropertyOptional({ example: 'متجري' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessNameAr?: string;

  @ApiProperty({ example: 'my-store' })
  @IsString()
  @MinLength(3, { message: 'معرف المنشأة يجب أن يكون 3 أحرف على الأقل' })
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'معرف المنشأة يجب أن يحتوي على أحرف صغيرة وأرقام وشرطات فقط',
  })
  businessSlug: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم',
  })
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم',
  })
  newPassword: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  logoutOtherDevices?: boolean;
}

// Response DTOs
export class TokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ example: 900 })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;
}

export class UserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  role: string;

  @ApiPropertyOptional()
  avatar?: string;

  @ApiProperty()
  tenant: {
    id: string;
    name: string;
    slug: string;
    subdomain: string;
    status: string;
    plan: { name: string; slug: string };
  };
}

export class AuthResponseDto extends TokenResponseDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;
}

export class UserProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenant: any;
}
