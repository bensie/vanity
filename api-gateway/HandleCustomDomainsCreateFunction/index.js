const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB({
  region: process.env.REGION
})

exports.handler = (event, context, callback) => {
  const body = JSON.parse(event.body)
  const domainName = event.pathParameters.domain_name.toLowerCase()
  const originDomainName = body.origin_domain_name.toLowerCase()
  const regex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/g

  console.log(`Handling create for ${domainName} => ${originDomainName}`)

  if (!domainName.match(regex)) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ error: 'domain_name is invalid' })
    }
    callback(null, response)
    return
  }

  if (!originDomainName.match(regex)) {
    const response = {
      statusCode: 400,
      body: JSON.stringify({ error: 'origin_domain_name is invalid' })
    }
    callback(null, response)
    return
  }

  const setupStartedAt = Date.now()
  const putItemParams = {
    TableName: process.env.DYNAMODB_TABLE,
    Item: {
      DomainName: {
        S: domainName
      },
      SetupStartedAt: {
        N: `${setupStartedAt}`
      },
      OriginDomainName: {
        S: originDomainName
      }
    },
    ConditionExpression: 'DomainName <> :d',
    ExpressionAttributeValues: {
      ':d': {
        S: domainName
      }
    }
  }

  dynamodb.putItem(putItemParams, function(err, data) {
    if (err) {
      console.log(err, err.stack)
      const response = {
        statusCode: 400,
        body: JSON.stringify({ error: 'domain_name already exists' })
      }
      callback(null, response)
    } else {
      console.log(data)
      const response = {
        statusCode: 201,
        body: JSON.stringify({
          domain_name: domainName,
          origin_domain_name: originDomainName,
          setup_started_at: setupStartedAt
        })
      }
      callback(null, response)
    }
  })
}
