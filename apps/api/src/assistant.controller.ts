import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AssistantService } from './assistant.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

class ChatMessageDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(1000) content!: string;
}

class ChatDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}

@Controller('assistant')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Signed-in users only; capped per client because free models are rate limited upstream. */
  @Post('chat')
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  chat(@Body() body: ChatDto) {
    return this.assistant.chat(body.messages);
  }
}
