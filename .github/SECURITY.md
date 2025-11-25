# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, please report it by one of the following methods:

1. **Email**: Send an email to the repository owner with details about the vulnerability
2. **GitHub Security Advisory**: Use GitHub's [private vulnerability reporting](https://github.com/yourystancato/react-fetch-cache/security/advisories/new)

### What to Include

When reporting a vulnerability, please include:

- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity (typically 7-30 days)

### Security Best Practices

When using this library:

1. Always use the latest version
2. Review the code if using in a security-sensitive context
3. Report vulnerabilities responsibly
4. Keep your dependencies updated

## Security Considerations

This library handles:

- AbortController/AbortSignal for request cancellation
- Promise caching
- Error handling

Please ensure:

- AbortSignals are properly handled in your fetcher functions
- Errors are properly caught and handled
- Sensitive data is not logged or exposed in error messages
