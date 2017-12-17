const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const route53 = new AWS.Route53()
const ses = new AWS.SES()

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

const getVerifyDomainIdentityParams = ({ item }) => {
  return new Promise(resolve => {
    const verifyDomainIdentityParams = {
      Domain: item.DomainName.S
    }
    resolve({ item, verifyDomainIdentityParams })
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
          resolve({ item, domainIdentity: data })
        }
      })
    }
  })
}

const verifyDomainDkim = ({ item, domainIdentity }) => {
  return new Promise((resolve, reject) => {
    params = {
      Domain: item.DomainName.S
    }
    ses.verifyDomainDkim(params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, domainIdentity, domainDkim: data })
      }
    })
  })
}

const getRecordSetChanges = ({ item, domainIdentity, domainDkim }) => {
  return new Promise(resolve => {
    let changes = []
    changes.push({
      Action: 'UPSERT',
      ResourceRecordSet: {
        Name: `_amazonses.${item.DomainName.S}`,
        ResourceRecords: [
          {
            Value: `"${domainIdentity.VertificationToken}"`
          }
        ],
        TTL: 3600,
        Type: 'TXT'
      }
    })
    domainDkim.DkimTokens.forEach(token => {
      changes.push({
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: `${token}._domainkey.${item.DomainName.S}`,
          ResourceRecords: [
            {
              Value: `${token}.dkim.amazonses.com.`
            }
          ],
          TTL: 3600,
          Type: 'CNAME'
        }
      })
    })
    const recordSetChanges = {
      ChangeBatch: {
        Changes: changes
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

const getUpdateItemParams = ({ item }) => {
  return new Promise(resolve => {
    const updateItemParams = {
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
  const failure = err => callback(err)

  getItem(domainName)
    .then(getVerifyDomainIdentityParams)
    .then(verifyDomainIdentity)
    .then(verifyDomainDkim)
    .then(getRecordSetChanges)
    .then(changeResourceRecordSets)
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
