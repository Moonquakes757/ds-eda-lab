/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

const s3 = new S3Client();
const dynamo = new DynamoDBClient();
const tableName = process.env.TABLE_NAME!;

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);        // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      console.log("Record body ", JSON.stringify(snsMessage));
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

        const lowerKey = srcKey.toLowerCase();
        if (!(lowerKey.endsWith(".jpeg") || lowerKey.endsWith(".png"))) {
          console.error(`Unsupported file type: ${srcKey}`);
          throw new Error(`Invalid image format: ${srcKey}`);
        }

        let origimage = null;
        try {
          // Download the image from the S3 source bucket.
          const params: GetObjectCommandInput = {
            Bucket: srcBucket,
            Key: srcKey,
          };
          origimage = await s3.send(new GetObjectCommand(params));
          // Process the image ......

          await dynamo.send(
            new PutItemCommand({
              TableName: tableName,
              Item: {
                id: { S: srcKey },
              },
            })
          );

          console.log(`Inserted ${srcKey} into table ${tableName}`);
        } catch (error) {
          console.log(error);
          throw error;
        }
      }
    }
  }
};
