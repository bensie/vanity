const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const route53 = new AWS.Route53()

class SkipToEndWithSuccessError extends Error {}

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

const getRecordSetChanges = ({ item }) => {
  return new Promise(resolve => {
    const recordSetChanges = {
      ChangeBatch: {
        Changes: [
          {
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: item.DomainName.S,
              Type: 'A',
              AliasTarget: {
                DNSName: item.CloudFrontDistributionDomainName.S,
                EvaluateTargetHealth: false,
                HostedZoneId: 'Z2FDTNDATAQYW2'
              }
            }
          }
        ]
      },
      HostedZoneId: item.Route53HostedZoneID.S
    }
    resolve({ item, recordSetChanges })
  })
}

const changeResourceRecordSets = ({ item, recordSetChanges }) => {
  return new Promise((resolve, reject) => {
    route53.changeResourceRecordSets(recordSetChanges, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item })
      }
    })
  })
}

exports.handler = (event, _context, callback) => {
  const { domainName } = event
  const success = () => callback(null, { domainName })
  const failure = err => callback(err)

  getItem(domainName)
    .then(getRecordSetChanges)
    .then(changeResourceRecordSets)
    .then(() => success())
    .catch(error => {
      if (error instanceof SkipToEndWithSuccessError) {
        success()
      } else {
        failure(error)
      }
    })
}
