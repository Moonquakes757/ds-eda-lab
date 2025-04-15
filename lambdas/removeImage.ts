/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const s3 = new S3Client();

export const handler: SQSHandler = async (event) => {
  console.log("RemoveImage Lambda triggered");

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const snsMessage = JSON.parse(body.Message);

      if (snsMessage.Records) {
        for (const messageRecord of snsMessage.Records) {
          const s3e = messageRecord.s3;
          const bucket = s3e.bucket.name;
          const key = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

          console.log(`Deleting object: s3://${bucket}/${key}`);

          await s3.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: key,
            })
          );

          console.log(`Deleted: ${key}`);
        }
      }
    } catch (err) {
      console.error("Error processing message", err);
    }
  }
};
