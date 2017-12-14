const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB({
  region: process.env.REGION
})

exports.handler = (event, context, callback) => {
  const domainName = event.pathParameters.domain_name.toLowerCase()

  const regex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/g
  if (!domainName.match(regex)) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ error: 'domain_name is invalid' })
    }
    callback(null, response)
    return
  }

  const getItemParams = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      DomainName: {
        S: domainName
      }
    }
  }

  dynamodb.getItem(getItemParams, function(err, data) {
    if (err) {
      console.log(err, err.stack)
      const response = {
        statusCode: 500,
        body: JSON.stringify({ error: 'there was an error in DynamoDB' })
      }
      callback(null, response)
    } else {
      console.log(data)
      if (Object.keys(data).length === 0) {
        const response = {
          statusCode: 404,
          body: JSON.stringify({ error: 'domain_name not found' })
        }
        callback(null, response)
      } else {
        const response = {
          statusCode: 200,
          body: JSON.stringify({
            domain_name: data.DomainName.S,
            origin_domain_name: data.OriginDomainName.S,
            setup_started_at: data.SetupStartedAt.N
          })
        }
        callback(null, response)
      }
    }
  })
}
