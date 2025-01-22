import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const client = new DynamoDB({});
const ddb = DynamoDBDocument.from(client);

const userTable = process.env.userTable;
const messageTable = process.env.messageTable;
const isActiveUserIndex = process.env.isActiveUserIndex;

export const handler = async (event, context) => {
  const currentConnectionId = event.requestContext.connectionId;
  const username = JSON.parse(event.body).username;

  let connections;
  try {
    await ddb.update({
      TableName: userTable,
      Key: {
        connectionId: currentConnectionId,
      },
      UpdateExpression: 'set #username = :username, #isActive = :isActive',
      ExpressionAttributeNames: {
        '#username': 'username',
        '#isActive': 'isActive',
      },
      ExpressionAttributeValues: {
        ':username': username,
        ':isActive': 1,
      }
    });
    console.log("Username updated.")

    connections = await ddb.query({ 
      TableName: userTable, 
      IndexName: isActiveUserIndex,
      KeyConditionExpression: "isActive = :isActive",
      ExpressionAttributeValues: {
        ':isActive': 1
      }
    });
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
    };
  }

  const apiClient = new ApiGatewayManagementApiClient({
    apiVersion: "2018-11-29",
    endpoint: `https://${event.requestContext.domainName}`,
  });

  const data = {
    messageId: crypto.randomUUID(),
    username: username,
    messageType: 'join',
    message: `has joined the chat.`,
    createdAt: new Date().getTime(),
  }


  const sendMessages = connections.Items.map(async ({ connectionId }) => {
    if (connectionId !== currentConnectionId) {
      const postCommand = new PostToConnectionCommand({
        ConnectionId: connectionId, 
        Data: JSON.stringify(data),
      });
      console.log(`post to ${connectionId}`);

      try {
        await apiClient.send(postCommand);
      } catch (e) {
        console.log(e);
      }
    }
  });
  
  try {
    await ddb
      .put({
        TableName: messageTable,
        Item: {
          isDeleted: 0,
          createdAtConnectionId: data.createdAt + '#' + currentConnectionId,
          ...data,
        },
      });
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
    };
  }

  try {
    await Promise.all(sendMessages);
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
    };
  }

  return { statusCode: 200 };
};
