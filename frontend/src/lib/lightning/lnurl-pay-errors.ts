const UNSUPPORTED_TAG_MESSAGES: Record<string, string> = {
  withdrawRequest:
    'LNURL withdraw is not supported. Use a BOLT11 invoice or Lightning address.',
  login: 'LNURL login/auth is not supported.',
  channelRequest: 'LNURL channel requests are not supported.',
}

export function lnurlUnsupportedTagMessage(tag: string): string {
  return (
    UNSUPPORTED_TAG_MESSAGES[tag] ??
    `LNURL type "${tag}" is not supported.`
  )
}

export class LnurlUnsupportedTagError extends Error {
  readonly tag: string

  constructor(tag: string) {
    super(lnurlUnsupportedTagMessage(tag))
    this.name = 'LnurlUnsupportedTagError'
    this.tag = tag
  }
}

export class LnurlFetchError extends Error {
  constructor(message = 'Could not reach LNURL server. The site may block browser requests.') {
    super(message)
    this.name = 'LnurlFetchError'
  }
}
