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

const getDistributionConfig = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Id: item.CloudFrontDistributionID.S
    }

    cloudfront.getDistributionConfig(params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve({
          item,
          distributionConfig: data.DistributionConfig,
          eTag: data.ETag
        })
      }
    })
  })
}

const disableDistribution = ({ item, distributionConfig, eTag }) => {
  return new Promise((resolve, reject) => {
    distributionConfig.Enabled = false
    const params = {
      Id: item.CloudFrontDistributionID.S,
      DistributionConfig: distributionConfig,
      IfMatch: eTag
    }

    cloudfront.updateDistribution(params, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve({ item, eTag: data.ETag })
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

    cloudfront.deleteDistribution(params, (err, _data) => {
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
    .then(getDistributionConfig)
    .then(disableDistribution)
    .then(deleteDistribution)
    .then(() => success())
    .catch(error => failure(error))
}
