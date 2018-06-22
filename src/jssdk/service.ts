import { Inject, Injectable } from '@nestjs/common';

import * as debug from 'debug';
import * as dayjs from 'dayjs';
const log = debug('wxauth:jssdk');

import { WeChatService } from '../wechat/service';

export interface SDKTicket {
  ticket: string;
  expiresIn: number;
}

const WECHAT_APP_ID = 'WECHAT_APP_ID';
const WECHAT_SECRET = 'WECHAT_SECRET';

@Injectable()
export class JSSDKService extends WeChatService {
  private ticket: string = null;
  private ticketExpiresTime: dayjs.Dayjs = null;

  constructor(
    @Inject(WECHAT_APP_ID) appId: string,
    @Inject(WECHAT_SECRET) secret: string,
  ) {
    super(appId, secret);
  }

  async getSDKTicket(): Promise<SDKTicket | void> {
    try {
      if (this.ticket && dayjs().isBefore(this.ticketExpiresTime))
        return Promise.resolve({
          ticket: this.ticket,
          expiresIn: this.ticketExpiresTime.diff(dayjs(), 'second'),
        });
      if (!this.accessToken) await this.getAccessToken();

      return this.wechatService
        .get('/cgi-bin/ticket/getticket', {
          params: {
            access_token: this.accessToken,
            type: 'jsapi',
          },
        })
        .then(({ data }) => {
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
        })
        .catch(err => log('>>> fail fetch ticket: ', err));
    } catch (error) {
      throw error;
    }
  }
}