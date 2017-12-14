# AWS Custom Domains

This project aims to provide repeatable infrastructure templates for a web service to point any user-owned domain or subdomain at your application.

## Assumptions

* Your backend already provides account-level subdomains on your app's domain (user.mycoolapp.com).
* Your backend is served with HTTPS and you want custom domains to only be served over HTTPS.
* You have an AWS account. **I recommend creating a new, separate AWS account just for this service for security reasons and so you don't fill your main account with customer-specific data**. The IAM role granted to the Lambda functions has broad access to CloudFront distributions, Certificate Manager certificates, and Route 53 domains within your account.

## Dependencies

With a single click and the default settings, your copy of this service can be up and running in seconds. Know that some AWS services will incur usage costs (it's minimal though, pennies per month in most cases).

The following AWS services are used:

* API Gateway
* CloudFront
* Certificate Manager
* DynamoDB
* IAM
* Lambda
* Route 53
* S3
* Step Functions

## Installation

Click the "Launch Stack" to bootstrap everything you need in the us-east-1 (N. Virginia) region.
