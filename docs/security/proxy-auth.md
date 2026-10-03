# Trusted proxy authentication

Header-based authentication requires `MC_PROXY_AUTH_HEADER`,
`MC_PROXY_AUTH_TRUSTED_IPS`, and `MC_PROXY_AUTH_SECRET` with at least 32 characters.
Generate the secret securely and provide it through environment configuration.
Do not commit the value or use it in browser code.

Configure the authenticating reverse proxy to overwrite the username and IP
headers and set `X-MC-Proxy-Secret` to its matching environment-held secret.
Do not pass through a client's value for any of these authentication headers.
Keep direct backend access restricted to the proxy, using loopback binding or
network controls appropriate to the deployment.

Forwarded IP headers are client-settable and App Router `Request` does not
provide a trusted socket peer address. An IP allowlist alone cannot establish
who supplied an authenticated username. Missing or weak secret configuration
therefore disables proxy auth and records one safe configuration warning.
Session and API-key authentication continue through their normal checks.

Existing proxy-auth deployments must configure the matching secret on both
sides before installing this release. The Studio uses shared local services;
this change does not enable proxy authentication or create any credentials.
