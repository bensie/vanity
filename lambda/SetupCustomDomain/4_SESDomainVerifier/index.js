const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
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

const getIdentityVerificationAttributes = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Identities: [item.DomainName.S]
    }
    ses.getIdentityVerificationAttributes(params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        if (
          data.VerificationAttributes[item.DomainName.S].VerificationStatus ===
          'Success'
        ) {
          resolve({ item })
        } else {
          reject(new Error('SES TXT record not yet detected'))
        }
      }
    })
  })
}

const getIdentityDkimAttributes = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Identities: [item.DomainName.S]
    }
    ses.getIdentityDkimAttributes(params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        if (
          data.DkimAttributes[item.DomainName.S].DkimVerificationStatus ===
          'Success'
        ) {
          resolve({ item })
        } else {
          reject(new Error('SES DKIM CNAMEs not yet detected'))
        }
      }
    })
  })
}

const enableDkim = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Identity: item.DomainName.S,
      DkimEnabled: true
    }
    ses.setIdentityDkimEnabled(params, (err, data) => {
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
        'SET SESDomainIdentityVerifiedAt=:SESDomainIdentityVerifiedAt, SESDomainDKIMVerifiedAt=:SESDomainDKIMVerifiedAt',
      ExpressionAttributeValues: {
        ':SESDomainIdentityVerifiedAt': {
          N: `${Date.now()}`
        },
        ':SESDomainDKIMVerifiedAt': {
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
  const failure = err => {
    err.domainName = domainName
    callback(err)
  }

  getItem(domainName)
    .then(getIdentityVerificationAttributes)
    .then(getIdentityDkimAttributes)
    .then(enableDkim)
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
