const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const dynamodb = new AWS.DynamoDB()
const cloudfront = new AWS.CloudFront()

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

const verifyDistributionDeleted = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Id: item.CloudFrontDistributionID.S
    }

    cloudfront.getDistribution(params, (err, data) => {
      if (err) {
        // Resolve on error because we are confirming that it's gone and expect
        // an error
        resolve({ item })
      } else {
        const status = data.Distribution.Status
        reject(
          new Error(
            `CloudFront distribution still exists with status ${status}`
          )
        )
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
        'REMOVE CloudFrontDistributionVerifiedAt, CloudFrontDistributionID, CloudFrontDistributionDomainName'
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
    .then(verifyDistributionDeleted)
    .then(getUpdateItemParams)
    .then(updateItem)
    .then(() => success())
    .catch(error => failure(error))
}
