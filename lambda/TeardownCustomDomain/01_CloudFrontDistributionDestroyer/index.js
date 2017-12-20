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

const deleteDistribution = ({ item }) => {
  return new Promise((resolve, reject) => {
    const params = {
      Id: item.CloudFrontDistributionID.S
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
    .then(deleteDistribution)
    .then(() => success())
    .catch(error => failure(error))
}
