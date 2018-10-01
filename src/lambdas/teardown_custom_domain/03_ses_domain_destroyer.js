const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const ses = new AWS.SES()

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

const deleteIdentity = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Identity: item.DomainName.S
    }

    ses.deleteIdentity(params, err => {
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
        'REMOVE SESDomainIdentityCreatedAt, SESDomainIdentityVerifiedAt, SESDomainDKIMVerifiedAt'
    }
    resolve({ item, updateItemParams })
  })
}

const updateItem = ({ updateItemParams }) => {
  return new Promise((resolve, reject) => {
    dynamodb.updateItem(updateItemParams, err => {
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
    const serializedError = JSON.stringify({
      message: err.message,
      domainName
    })
    callback(new Error(serializedError))
  }

  getItem(domainName)
    .then(deleteIdentity)
    .then(getUpdateItemParams)
    .then(updateItem)
    .then(() => success())
    .catch(error => failure(error))
}
