import { FabrixPolicy as Policy } from '@fabrix/fabrix/dist/common'

/**
 * @module ProxyCartPolicy
 * @description Proxy Cart Policy
 */
export class ProxyCartPolicy extends Policy {
  clientDetails(req, res, next) {
    // Init Client Details
    const clientDetails: {[key: string]: any} = {
      host: req.headers.host,
      browser_ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      accept_language: req.headers['accept-language'],
      user_agent: req.headers['user-agent'],
      browser_height: req.body.client_details ? req.body.client_details.browser_height : null,
      browser_width: req.body.client_details ? req.body.client_details.browser_width : null,
      session_hash: req.session ? req.session.id : '',
      latitude: req.body.client_details ? req.body.client_details.latitude : null,
      longitude: req.body.client_details ? req.body.client_details.longitude : null
    }

    if (req.user && req.user.id) {
      clientDetails.user_id = req.user.id
    }

    // Attach values to the request body
    req.body.ip = clientDetails.browser_ip
    req.body.client_details = clientDetails
    // TODO enable Multi Tenant
    // req.body.host = req.params.host
    this.app.log.silly('ProxyCartPolicy.clientDetails', clientDetails)
    next()
  }
}

