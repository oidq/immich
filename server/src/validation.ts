import {
  ArgumentMetadata,
  BadRequestException,
  FileValidator,
  Injectable,
  ParseUUIDPipe,
  applyDecorators,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateBy,
  ValidateIf,
  ValidationOptions,
  buildMessage,
  isDateString,
  maxDate,
} from 'class-validator';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';
import sanitize from 'sanitize-filename';

@Injectable()
export class ParseMeUUIDPipe extends ParseUUIDPipe {
  async transform(value: string, metadata: ArgumentMetadata) {
    if (value == 'me') {
      return value;
    }
    return super.transform(value, metadata);
  }
}

@Injectable()
export class FileNotEmptyValidator extends FileValidator {
  constructor(private requiredFields: string[]) {
    super({});
    this.requiredFields = requiredFields;
  }

  isValid(files?: any): boolean {
    if (!files) {
      return false;
    }

    return this.requiredFields.every((field) => files[field]);
  }

  buildErrorMessage(): string {
    return `Field(s) ${this.requiredFields.join(', ')} should not be empty`;
  }
}

export class UUIDParamDto {
  @IsNotEmpty()
  @IsUUID('4')
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export interface OptionalOptions extends ValidationOptions {
  nullable?: boolean;
}

/**
 * Checks if value is missing and if so, ignores all validators.
 *
 * @param validationOptions {@link OptionalOptions}
 *
 * @see IsOptional exported from `class-validator.
 */
// https://stackoverflow.com/a/71353929
export function Optional({ nullable, ...validationOptions }: OptionalOptions = {}) {
  if (nullable === true) {
    return IsOptional(validationOptions);
  }

  return ValidateIf((object: any, v: any) => v !== undefined, validationOptions);
}

type UUIDOptions = { optional?: boolean; each?: boolean; nullable?: boolean };
export const ValidateUUID = (options?: UUIDOptions) => {
  const { optional, each, nullable } = { optional: false, each: false, nullable: false, ...options };
  return applyDecorators(
    IsUUID('4', { each }),
    ApiProperty({ format: 'uuid' }),
    optional ? Optional({ nullable }) : IsNotEmpty(),
    each ? IsArray() : IsString(),
  );
};

type DateOptions = { optional?: boolean; nullable?: boolean; format?: 'date' | 'date-time' };
export const ValidateDate = (options?: DateOptions) => {
  const { optional, nullable, format } = { optional: false, nullable: false, format: 'date-time', ...options };

  const decorators = [
    ApiProperty({ format }),
    IsDate(),
    optional ? Optional({ nullable: true }) : IsNotEmpty(),
    Transform(({ key, value }) => {
      if (value === null || value === undefined) {
        return value;
      }

      if (!isDateString(value)) {
        throw new BadRequestException(`${key} must be a date string`);
      }

      return new Date(value as string);
    }),
  ];

  if (optional) {
    decorators.push(Optional({ nullable }));
  }

  return applyDecorators(...decorators);
};

type BooleanOptions = { optional?: boolean };
export const ValidateBoolean = (options?: BooleanOptions) => {
  const { optional } = { optional: false, ...options };
  const decorators = [
    // ApiProperty(),
    IsBoolean(),
    Transform(({ value }) => {
      if (value == 'true') {
        return true;
      } else if (value == 'false') {
        return false;
      }
      return value;
    }),
  ];

  if (optional) {
    decorators.push(Optional());
  }

  return applyDecorators(...decorators);
};

export function validateCronExpression(expression: string) {
  try {
    new CronJob(expression, () => {});
  } catch {
    return false;
  }

  return true;
}

type IValue = { value: unknown };

export const toEmail = ({ value }: IValue) => (typeof value === 'string' ? value.toLowerCase() : value);

export const toSanitized = ({ value }: IValue) => {
  const input = typeof value === 'string' ? value : '';
  return sanitize(input.replaceAll('.', ''));
};

export const isValidInteger = (value: number, options: { min?: number; max?: number }): value is number => {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;
  return Number.isInteger(value) && value >= min && value <= max;
};

export function isDateStringFormat(value: unknown, format: string) {
  if (typeof value !== 'string') {
    return false;
  }
  return DateTime.fromFormat(value, format, { zone: 'utc' }).isValid;
}

export function IsDateStringFormat(format: string, validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isDateStringFormat',
      constraints: [format],
      validator: {
        validate(value: unknown) {
          return isDateStringFormat(value, format);
        },
        defaultMessage: () => `$property must be a string in the format ${format}`,
      },
    },
    validationOptions,
  );
}

export function MaxDateString(date: Date | (() => Date), validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxDateString',
      constraints: [date],
      validator: {
        validate: (value, args) => {
          const date = DateTime.fromISO(value, { zone: 'utc' }).toJSDate();
          return maxDate(date, args?.constraints[0]);
        },
        defaultMessage: buildMessage(
          (eachPrefix) => 'maximal allowed date for ' + eachPrefix + '$property is $constraint1',
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
