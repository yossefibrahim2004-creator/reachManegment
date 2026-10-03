import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ChangeRequestItemAction,
  ChangeRequestType,
} from '@prisma/client';

export class InvoiceChangeRequestItemInput {
  @ApiProperty({ enum: ChangeRequestItemAction, example: ChangeRequestItemAction.RETURN_ITEM })
  @IsEnum(ChangeRequestItemAction)
  action: ChangeRequestItemAction;

  // Required whenever the action targets an existing invoice line.
  // Note: class-validator ANDs stacked ValidateIf conditions, so each property
  // gets exactly one condition that ORs its allowed actions.
  @ValidateIf(
    (item: InvoiceChangeRequestItemInput) =>
      item.action === ChangeRequestItemAction.RETURN_ITEM ||
      item.action === ChangeRequestItemAction.REMOVE_ITEM ||
      item.action === ChangeRequestItemAction.CHANGE_PRICE,
  )
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ example: 15 })
  invoiceItemId?: number;

  // Type-checked whenever present; whether it is allowed is enforced per action.
  @ApiPropertyOptional({ example: 88 })
  @IsOptional()
  @IsInt()
  @Min(1)
  productUnitId?: number;

  @ApiPropertyOptional({ example: 11 })
  @IsOptional()
  @IsInt()
  @Min(1)
  productModelId?: number;

  // Required when adding an item. For return/removal rows the quantity is only
  // required for non-serialized lines, which the service decides — so the DTO
  // validates the type here and leaves presence to the service.
  @ValidateIf((item: InvoiceChangeRequestItemInput) => item.action === ChangeRequestItemAction.ADD_ITEM)
  @IsNumber()
  @Min(0.01)
  @ApiPropertyOptional({ example: 2 })
  quantity?: number;

  // Required when the action needs a price (add / price change).
  @ValidateIf(
    (item: InvoiceChangeRequestItemInput) =>
      item.action === ChangeRequestItemAction.ADD_ITEM ||
      item.action === ChangeRequestItemAction.CHANGE_PRICE,
  )
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional({ example: 450, minimum: 0 })
  proposedPrice?: number;

  @ApiPropertyOptional({ example: 'Customer reported a defect' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateInvoiceChangeRequestInput {
  @ApiProperty({ enum: ChangeRequestType, example: ChangeRequestType.PARTIAL_RETURN })
  @IsEnum(ChangeRequestType)
  type: ChangeRequestType;

  @ApiProperty({ example: 'Wrong item delivered' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  proposedCustomerId?: number;

  @ApiProperty({ type: [InvoiceChangeRequestItemInput] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceChangeRequestItemInput)
  items: InvoiceChangeRequestItemInput[];
}

export class ChangeRequestDecisionDto {
  @ApiPropertyOptional({ example: 'Approved after review' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'Checked with the customer' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
