import os
from dotenv import load_dotenv
import boto3

load_dotenv()

R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME')
CLOUDFLARE_ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY')

s3 = boto3.client(
    's3',
    endpoint_url=f'https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com',
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto' # Cloudflare R2 uses 'auto'
)

def configure_cors():
    print(f"Configuring CORS for bucket: {R2_BUCKET_NAME}")
    
    cors_configuration = {
        'CORSRules': [
            {
                'AllowedHeaders': ['*'],
                'AllowedMethods': ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                'AllowedOrigins': ['*'],
                'ExposeHeaders': ['ETag', 'x-amz-server-side-encryption', 'x-amz-request-id', 'x-amz-id-2'],
                'MaxAgeSeconds': 3600
            }
        ]
    }
    
    try:
        s3.put_bucket_cors(
            Bucket=R2_BUCKET_NAME,
            CORSConfiguration=cors_configuration
        )
        print("Successfully configured CORS on the bucket.")
        
        # Also just try listing to ensure it works
        response = s3.list_objects_v2(Bucket=R2_BUCKET_NAME, MaxKeys=5)
        print(f"Successfully accessed bucket. Found {response.get('KeyCount', 0)} objects.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    configure_cors()
