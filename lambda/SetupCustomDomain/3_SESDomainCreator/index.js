const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const route53 = new AWS.Route53()
const ses = new AWS.SES()

class SkipToEndWithSuccessError extends Error {}

const getItemParams = domainName => {
  return new Promise(resolve => {
    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: domainName
        }
      }
    }
    resolve(params)
  })
}

const getItem = itemParams => {
  return new Promise((resolve, reject) => {
    dynamodb.getItem(itemParams, (err, data) => {
      if (err) {
        reject(err)
      } else if (Object.keys(data).length === 0) {
        reject(new Error('domain_name not found'))
      } else {
        resolve(data.Item)
      }
    })
  })
}

const getVerifyDomainIdentityParams = item => {
  return new Promise(resolve => {
    const params = {
      Domain: item.DomainName.S
    }
    resolve({ item, params })
  })
}

const verifyDomainIdentity = ({ item, verifyDomainIdentityParams }) => {
  return new Promise((resolve, reject) => {
    if (item.SESDomainIdentityCreatedAt) {
      reject(
        new SkipToEndWithSuccessError(
          'SES domain identity already exists, continuing'
        )
      )
    } else {
      ses.verifyDomainIdentity(verifyDomainIdentityParams, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve({ item, data })
        }
      })
    }
  })
}

const getRecordSetChanges = ({ item, domainIdentity }) => {
  return new Promise(resolve => {
    const changes = {
      ChangeBatch: {
        Changes: [
          {
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: `_amazonses.${item.DomainName.S}`,
              ResourceRecords: [
                {
                  Value: `"${verify.VertificationToken}"`
                }
              ],
              TTL: 3600,
              Type: 'TXT'
            }
          }
        ],
        Comment: 'SES domain identity record'
      },
      HostedZoneId: item.Route53HostedZoneID.S
    }
  })
}

const changeResourceRecordSets = changes => {
  return new Promise((resolve, reject) => {
    route53.changeResourceRecordSets(recordSetChanges, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

const updateItemParams = ({ item }) => {
  return new Promise(resolve => {
    const params = {
      TableName: process.env.DYNAMODB_TABLE,
      Key: {
        DomainName: {
          S: item.DomainName.S
        }
      },
      UpdateExpression:
        'SET SESDomainIdentityCreatedAt=:SESDomainIdentityCreatedAt',
      ExpressionAttributeValues: {
        ':SESDomainIdentityCreatedAt': {
          N: `${Date.now()}`
        }
      }
    }
    resolve({ item, params })
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

exports.handler = (event, context, callback) => {
  const { domainName } = event
  const success = () => callback(null, { domainName })
  const failure = err => callback(err)

  getItemParams()
    .then(getItem)
    .then(getVerifyDomainIdentityParams)
    .then(verifyDomainIdentity)
    .then(getRecordSetChanges)
    .then(changeResourceRecordSets)
    .then(updateItemParams)
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
