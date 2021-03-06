import { Injectable, BadRequestException } from '@nestjs/common';

import * as crypto from 'crypto';
import * as debug from 'debug';
import * as dayjs from 'dayjs';
import * as Joi from 'joi';
const log = debug('wxauth:jssdk');

import { WeChatService } from '../wechat/service';
import { ConfigService } from '../config/service';

export interface SDKTicket {
  ticket: string;
  expiresIn: number;
}

export interface SDKSign {
  sign: string;
  expiresIn: number;
}

interface SignInput {
  url: string;
  randomStr: string;
  timeStamp: number;
}

@Injectable()
export class JSSDKService extends WeChatService {
  private ticket: string = null;
  private ticketExpiresTime: dayjs.Dayjs = null;

  constructor(config: ConfigService) {
    super(config.get('WECHAT_APP_ID'), config.get('WECHAT_SECRET'));
  }

  async getSDKTicket(): Promise<SDKTicket> {
    try {
      if (this.ticket && dayjs().isBefore(this.ticketExpiresTime))
        return Promise.resolve({
          ticket: this.ticket,
          expiresIn: this.ticketExpiresTime.diff(dayjs(), 'second'),
        });
      if (!this.accessToken || dayjs().isAfter(this.accessTokenExpiresTime))
        await this.getAccessToken();

      const { data } = await this.wechatService.get(
        '/cgi-bin/ticket/getticket',
        {
          params: {
            access_token: this.accessToken,
            type: 'jsapi',
          },
        },
      );

      const { errcode, errmsg, ticket, expires_in } = data;
      if (errcode && errcode !== 0) throw new Error(errmsg);
      this.ticket = ticket;
      this.ticketExpiresTime = dayjs().add(
        expires_in - 200 /* Give some spare time before expires */,
        'second',
      );
      log('>>> fetch ticket success');
      return {
        ticket,
        expiresIn: expires_in,
      } as SDKTicket;
    } catch (error) {
      log('>>> fail fetch ticket: ', error);
      throw error;
    }
  }

  async getSDKSign(input: SignInput): Promise<SDKSign> {
    try {
      const inputSchema = Joi.object({
        url: Joi.string().required(),
        randomStr: Joi.string().required(),
        timeStamp: Joi.number().required(),
      });

      const { error: validError } = Joi.validate(input, inputSchema);
      if (validError) throw new BadRequestException(validError.message);

      const { url, randomStr, timeStamp } = input;
      if (url.includes('#'))
        throw new BadRequestException('Invalid URL, No "#" include.');
      const { ticket, expiresIn } = await this.getSDKTicket();

      return {
        sign: crypto
          .createHash('sha1')
          .update(
            `jsapi_ticket=${ticket}
            &noncestr=${randomStr}
            &timestamp=${timeStamp}
            &url=${url}`,
          )
          .digest('hex'),
        expiresIn,
      };
    } catch (error) {
      log('>>> fail generate sign: ', error);
      throw error;
    }
  }
}
