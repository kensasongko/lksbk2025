import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDB({});
const ddb = DynamoDBDocument.from(client);

export const handler = async (event, context) => {
  try {
    await ddb
      .put({
        TableName: process.env.userTable,
        Item: {
          connectionId: event.requestContext.connectionId,
          isActive: 0,
          createdAtConnectionId: new Date().getTime() + '#' + event.requestContext.connectionId,
        },
      });
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
    };
  }

  return {
    statusCode: 200,
  };
};
