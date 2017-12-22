# Vanity

This project aims to provide repeatable a infrastructure template for a web service to point any user-owned domain or subdomain at your application.

It runs entirely and securely in your own AWS account using only services that are 100% managed by AWS. In most cases it costs just a few pennies each month to run this service.

## Assumptions

* Your backend already provides account-level subdomains on your app's domain (user.mycoolapp.com). Vanity will point at this hostname when creating a new custom domain and requests will re-write the `HOST` header to match the backend subdomain, ensuring minimal web server configuration changes.
* Your backend is served with HTTPS and you want custom domains to only be served over HTTPS. HTTP is not supported.
* You have an AWS account. **I recommend creating a new, separate AWS account just for this service for security reasons and so you don't fill your main account with customer-specific data**. Permissions are tightly scoped where possible, but the IAM role granted to the Lambda functions has broad access to CloudFront distributions, Certificate Manager certificates, and Route 53 domains within your account.

## Dependencies

With a few clicks and the default settings, your copy of this service can be up and running in about 3 minutes. Know that some AWS services will incur usage costs (it's minimal though, pennies per month in most cases).

The following AWS services are used:

* API Gateway
* CloudFront
* CloudFormation
* Certificate Manager
* DynamoDB
* IAM
* Lambda
* Route 53
* SES
* SNS
* Step Functions

## What does it do?

For each domain you create, Vanity will do the following:

1. Create a Route 53 hosted zone for the domain. You or your customer must delegate DNS for the specified domain to the provided name servers by adding NS records. **Adding these NS records is the only step that must be done outside Vanity**. Note: there is no free tier for Route 53 so you will be [charged for hosted zones accordingly](https://aws.amazon.com/route53/pricing/).
1. Await the addition of these NS records. Vanity will check for these records every 30 seconds for 36 hours after which point the create operation will be marked as failed.
1. Create a domain identity in Simple Email Service (SES) and verify it for sending with DKIM using DNS verification.
1. Create a TLS certificate with Certificate Manager (ACM) and verify it with DNS.
1. Create a CloudFront distribution using the requested domain as the alias, apply the verified certificate to serve over HTTPS, and point it at the specified origin domain name (your existing application).

## Installation

Click the "Launch Stack" to bootstrap everything you need in the us-east-1 (N. Virginia) region. There is no step 2.

[![Launch stack in us-east-1](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=vanity-domains&templateURL=https://s3.amazonaws.com/vanity-domains/v1.0.0-beta32/cloudformation/stack.yml)

After creating your CloudFormation stack, the "Outputs" section of the Stack Detail contains the API Gateway base URL (called CustomDomainsAPIURL) for your custom domain service. It looks something like `https://xxxx.execute-api.us-east-1.amazonaws.com/v1/domains` and you'll use it for all requests to Vanity.

## Usage

This service provides 3 JSON API endpoints for management of custom domains. You can create a custom domain, fetch the status of a custom domain, and delete a custom domain.

For each action, you must supply the custom domain in the path. A `POST` request to this endpoint creates a new custom domain, a `GET` request fetches info about the existing custom domain, and a `DELETE` request removes the custom domain.

```
https://xxxx.execute-api.us-east-1.amazonaws.com/v1/domains/my.customdomain.com
```

### Create a domain

To create a new custom domain, you must supply the `origin_domain_name` as an attribute in a JSON request body:

#### Request

```
curl -X "POST" "https://xxxx.execute-api.us-east-1.amazonaws.com/v1/domains/my.customdomain.com" \
     -H 'Content-Type: application/json; charset=utf-8' \
     -d $'{
  "origin_domain_name": "user.mycoolapp.com"
}'
```

#### Response

```json
{
  "domain_name": "my.customdomain.com",
  "origin_domain_name": "user.mycoolapp.com",
  "setup_started_at": 1513811181230,
  "setup_verified_at": null,
  "setup_verification_failed_at": null,
  "delete_started_at": null,
  "nameservers": null,
  "route53_hosted_zone_created_at": null,
  "route53_hosted_zone_id": null,
  "nameserver_delegation_verified_at": null,
  "ses_domain_identity_created_at": null,
  "ses_domain_identity_verified_at": null,
  "ses_domain_dkim_verified_at": null,
  "acm_certificate_arn": null,
  "acm_certificate_verified_at": null,
  "cloudfront_distribution_id": null,
  "cloudfront_distribution_domain_name": null,
  "cloudfront_distribution_authenticity_header_name": null,
  "cloudfront_distribution_authenticity_header_value": null,
  "cloudfront_distribution_verified_at": null
}
```

### Get the status of a domain

After creating a domain, you can get its status at any time:

#### Request

```
curl "https://xxxx.execute-api.us-east-1.amazonaws.com/v1/domains/my.customdomain.com"
```

#### Response

```json
{
  "domain_name": "my.customdomain.com",
  "origin_domain_name": "user.mycoolapp.com",
  "setup_started_at": "1513895151502",
  "setup_verified_at": "1513901002322",
  "setup_verification_failed_at": null,
  "delete_started_at": null,
  "nameservers": [
    "ns-1020.awsdns-63.net",
    "ns-1133.awsdns-13.org",
    "ns-137.awsdns-17.com",
    "ns-1703.awsdns-20.co.uk"
  ],
  "route53_hosted_zone_created_at": "1513895155140",
  "route53_hosted_zone_id": "/hostedzone/Z3BHGxxxxxxxxx",
  "nameserver_delegation_verified_at": "1513895947741",
  "ses_domain_identity_created_at": "1513895952183",
  "ses_domain_identity_verified_at": "1513896047485",
  "ses_domain_dkim_verified_at": "1513896047486",
  "acm_certificate_arn":
    "arn:aws:acm:us-east-1:xxxx:certificate/c09846bd-b606-459e-xxxx-xxxxxxxxxxxx",
  "acm_certificate_verified_at": "1513896149665",
  "cloudfront_distribution_id": "E3MB8KKYEHYB09",
  "cloudfront_distribution_domain_name": "dirpofaes3eqa.cloudfront.net",
  "cloudfront_distribution_authenticity_header_name":
    "X-Domain-Authenticity-Token",
  "cloudfront_distribution_authenticity_header_value":
    "dc3da4fe-6abc-4cec-b9c1-32f5e841c130",
  "cloudfront_distribution_verified_at": "1513901000292"
}
```

### Delete a domain

After a domain has been created, you can delete it. Deletion takes awhile (there are a bunch of things to tear down in the AWS account), so you can still make subsequent `GET` requests to the domain to check the status of deletion. **You cannot delete a domain immediately after creating it, you must wait for it to fully finish creating first.**

#### Request

```
curl -X "DELETE" "https://xxxx.execute-api.us-east-1.amazonaws.com/v1/domains/my.customdomain.com"
```

#### Response

```
HTTP/1.1 204 No Content
```
