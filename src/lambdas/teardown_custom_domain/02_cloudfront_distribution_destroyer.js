const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const cloudfront = new AWS.CloudFront()

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
        if (data.Item.CloudFrontDistributionID) {
          resolve({ item: data.Item })
        } else {
          reject(new SkipToEndWithSuccessError('no distribution configured'))
        }
      }
    })
  })
}

const deleteDistribution = ({ item, eTag }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Id: item.CloudFrontDistributionID.S,
      IfMatch: eTag
    }

    cloudfront.deleteDistribution(params, err => {
      if (err) {
        if (err.code === 'NoSuchDistribution') {
          resolve({ item })
        } else {
          reject(err)
        }
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
        'REMOVE CloudFrontDistributionVerifiedAt, CloudFrontDistributionID, CloudFrontDistributionDomainName, CloudFrontDistributionAuthenticityHeaderName, CloudFrontDistributionAuthenticityHeaderValue'
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
  const { domainName, eTag } = event
  const success = () => callback(null, { domainName })
  const failure = err => {
    const serializedError = JSON.stringify({
      message: err.message,
      domainName
    })
    callback(new Error(serializedError))
  }

  getItem(domainName)
    .then(({ item }) => deleteDistribution({ item, eTag }))
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
