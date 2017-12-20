const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const cloudfront = new AWS.CloudFront()

class SkipToEndWithSuccessError extends Error {}

const idempotencyToken = (setupStartedAt, domainName) => {
  return `${setupStartedAt}${domainName}`.replace(/\W+/g, '').substring(0, 32)
}

const getItem = domainName => {
  return new Promise((resolve, reject) => {
    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: domainName
        }
      }
    }
    dynamodb.getItem(params, (err, data) => {
      if (err) {
        reject(err)
      } else if (Object.keys(data).length === 0) {
        reject(new Error('domain_name not found'))
      } else {
        resolve({ item: data.Item })
      }
    })
  })
}

const createDistribution = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      DistributionConfig: {
        CallerReference: idempotencyToken(
          item.SetupStartedAt.N,
          item.DomainName.S
        ),
        Aliases: {
          Quantity: 1,
          Items: [item.DomainName.S]
        },
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: `custom-origin-${item.DomainName.S}`,
              DomainName: item.OriginDomainName.S,
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: 'https-only',
                OriginSslProtocols: {
                  Quantity: 3,
                  Items: ['TLSv1', 'TLSv1.1', 'TLSv1.2']
                }
              }
            }
          ]
        },
        DefaultCacheBehavior: {
          TargetOriginId: `custom-origin-${item.DomainName.S}`,
          ForwardedValues: {
            QueryString: true,
            Cookies: {
              Forward: 'all'
            }
          },
          TrustedSigners: {
            Enabled: false,
            Quantity: 0
          },
          ViewerProtocolPolicy: 'redirect-to-https',
          MinTTL: 0,
          AllowedMethods: {
            Quantity: 7,
            Items: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'DELETE'],
            CachedMethods: {
              Quantity: 2,
              Items: ['GET', 'HEAD']
            }
          },
          SmoothStreaming: false,
          DefaultTTL: 0,
          MaxTTL: 0,
          Compress: false
        },
        Comment: '',
        Enabled: true,
        ViewerCertificate: {
          CloudFrontDefaultCertificate: false,
          ACMCertificateArn: item.ACMCertificateArn.S,
          SSLSupportMethod: 'sni-only',
          MinimumProtocolVersion: 'TLSv1_2016'
        },
        HttpVersion: 'http2'
      }
    }
    cloudfront.createDistribution(params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, distribution: data })
      }
    })
  })
}

const getUpdateItemParams = ({ item, distribution }) => {
  return new Promise(resolve => {
    const updateItemParams = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: item.DomainName.S
        }
      },
      UpdateExpression:
        'SET CloudFrontDistributionID=:CloudFrontDistributionID, CloudFrontDistributionDomainName=:CloudFrontDistributionDomainName',
      ExpressionAttributeValues: {
        ':CloudFrontDistributionID': {
          S: distribution.Distribution.Id
        },
        ':CloudFrontDistributionDomainName': {
          S: distribution.Distribution.DomainName
        }
      }
    }
    resolve({ item, updateItemParams })
  })
}

const updateItem = ({ item, updateItemParams }) => {
  return new Promise((resolve, reject) => {
    dynamodb.updateItem(updateItemParams, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

exports.handler = (event, _context, callback) => {
  const { domainName } = event
  const success = () => callback(null, { domainName })
  const failure = err => {
    err.domainName = domainName
    callback(err)
  }

  getItem(domainName)
    .then(createDistribution)
    .then(getUpdateItemParams)
    .then(updateItem)
    .then(() => success())
    .catch(error => {
      if (error instanceof SkipToEndWithSuccessError) {
        success()
      } else {
        failure(error)
      }
    })
}
