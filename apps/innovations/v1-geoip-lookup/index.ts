import { mapOpenApi3 as openApi } from '@aaronpowell/azure-functions-nodejs-openapi';
import type { AzureFunction, HttpRequest } from '@azure/functions';
import * as geoip from 'geoip-lite';
import Joi from 'joi';

import { JoiHelper, ResponseHelper, SwaggerHelper } from '@innovations/shared/helpers';
import type { CustomContextType } from '@innovations/shared/types';

import { BodySchema } from './validation.schemas';

class V1GeoIpLookup {
  static async httpTrigger(context: CustomContextType, request: HttpRequest): Promise<void> {
    try {
      context.log('GeoIP lookup triggered');

      // Get IP from body (B2C sends it as form or JSON) or query
      let ip =
        (request.body && request.body.ip) ||
        request.query.ip ||
        request.headers['x-forwarded-for'] ||
        request.connection.remoteAddress;

      if (request.body && request.body.ip) {
        const { ip: validatedIp } = JoiHelper.Validate<{ ip: string }>(BodySchema, request.body);
        ip = validatedIp;
      }

      // Clean IP (remove port if present)
      if (ip) {
        ip = ip.split(',')[0].trim();
        if (ip.startsWith('::ffff:')) ip = ip.substr(7);
      }

      // Default fallback
      let countryCode = 'XX'; // Unknown

      if (ip && ip !== '127.0.0.1' && ip !== '::1') {
        const lookup = geoip.lookup(ip);
        if (lookup && lookup.country) {
          countryCode = lookup.country; // e.g., "US", "CN", "RU"
        }
      }

      context.res = ResponseHelper.Ok({ countryCode });

      return;
    } catch (error) {
      context.res = ResponseHelper.Error(context, error);
      return;
    }
  }
}

const ResponseBodySchema = Joi.object({
  countryCode: Joi.string()
    .description('Two-letter country code (ISO 3166-1 alpha-2)')
    .example('GB')
});

export default openApi(V1GeoIpLookup.httpTrigger as AzureFunction, '/v1/geoip/lookup', {
  post: {
    description: 'Get country code for a given IP address.',
    operationId: 'v1-geoip-lookup',
    requestBody: SwaggerHelper.bodyJ2S(BodySchema, {
      description: 'IP address to lookup'
    }),
    responses: {
      '200': SwaggerHelper.responseJ2S(ResponseBodySchema, {
        description: 'The country code for the given IP address.'
      }),
      '400': { description: 'Bad request.' },
      '500': { description: 'An error occurred while fetching the geoip data.' }
    }
  },
  get: {
    description: 'Get country code for a given IP address.',
    operationId: 'v1-geoip-lookup-get',
    parameters: [
      {
        in: 'query',
        name: 'ip',
        schema: {
          type: 'string'
        },
        description: 'IP address to lookup'
      }
    ],
    responses: {
      '200': SwaggerHelper.responseJ2S(ResponseBodySchema, {
        description: 'The country code for the given IP address.'
      }),
      '400': { description: 'Bad request.' },
      '500': { description: 'An error occurred while fetching the geoip data.' }
    }
  }
});
