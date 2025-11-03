
***

# Airflow ETL with S3 Integration

This project demonstrates how to create an ETL pipeline using Apache Airflow that uploads and downloads datasets to and from an Amazon S3 bucket using Airflow's `S3Hook`.

## Prerequisites

- Apache Airflow installed and running.
- AWS account with access credentials (Access Key ID and Secret Access Key).
- An S3 bucket created for storing datasets.
- Airflow AWS connection configured via Airflow UI or environment variables.

## Setup

1. **Configure Airflow AWS Connection**

   - In Airflow UI, go to Admin > Connections.
   - Create a new connection with:
     - Conn Id: `aws_default` (or your preferred ID)
     - Conn Type: `Amazon Web Services`
     - Login: Your AWS Access Key ID
     - Password: Your AWS Secret Access Key
     - Extra: `{"region_name": "your-aws-region"}`

2. **Install Required Python Packages**

   Ensure you have the AWS SDK and Airflow S3 provider installed:

   ```bash
   pip install apache-airflow-providers-amazon
   ```

## Using the DAG

Place the provided DAG Python script in your Airflow DAGs folder. The DAG includes two tasks:

- `download_from_s3`: Downloads a file from the configured S3 bucket to a local path.
- `upload_to_s3`: Uploads a local file to the S3 bucket.

You can customize:

- S3 bucket name
- Keys (file paths) in S3
- Local file paths

## Example DAG Usage

The DAG uses Airflow's `S3Hook` to interact with S3. The workflow:

- Downloads the dataset file from S3.
- (Optionally, process or transform the data here.)
- Uploads the processed dataset back to S3.

## Sample Code Snippet

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from datetime import datetime

BUCKET_NAME = 'your-bucket-name'
DOWNLOAD_KEY = 'path/to/your/file.csv'
LOCAL_DOWNLOAD_PATH = '/tmp/downloaded_file.csv'
UPLOAD_KEY = 'path/to/uploaded_file.csv'
LOCAL_UPLOAD_PATH = '/tmp/file_to_upload.csv'

def download_from_s3():
    s3 = S3Hook(aws_conn_id='aws_default')
    s3.download_file(key=DOWNLOAD_KEY, bucket_name=BUCKET_NAME, local_path=LOCAL_DOWNLOAD_PATH)

def upload_to_s3():
    s3 = S3Hook(aws_conn_id='aws_default')
    s3.load_file(filename=LOCAL_UPLOAD_PATH, key=UPLOAD_KEY, bucket_name=BUCKET_NAME, replace=True)

with DAG(dag_id='etl_s3_example', start_date=datetime(2025, 1, 1), schedule_interval='@daily', catchup=False) as dag:
    download_task = PythonOperator(task_id='download_from_s3', python_callable=download_from_s3)
    upload_task = PythonOperator(task_id='upload_to_s3', python_callable=upload_to_s3)

    download_task >> upload_task
```

## Notes

- Replace `your-bucket-name`, keys, and file paths with your actual details.
- Ensure AWS credentials used in Airflow have permissions for S3 get and put object actions.
- This setup assumes you have Airflow’s AWS provider installed and configured correctly.

***

This README will help you get started with your Airflow ETL tasks using S3 buckets for uploading and downloading datasets. Let me know if you want a full example DAG or more advanced features included.