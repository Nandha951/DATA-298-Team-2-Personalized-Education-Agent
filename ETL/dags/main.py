from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from datasets import load_dataset
import pandas as pd
import os
from datetime import datetime

# Base folder where this DAG file is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Folder inside DAG folder to store datasets
LOCAL_DIR = os.path.join(BASE_DIR, 'dataset_storage')
LOCAL_PATH = os.path.join(LOCAL_DIR, 'sql_fine_tune_dataset.csv')
LOCAL_CLEANED_PATH = os.path.join(LOCAL_DIR, 'cleaned_sql_fine_tune.csv')

# Configurations
BUCKET_NAME = 'your-s3-bucket'
S3_KEY = 'datasets/sql_fine_tune_dataset.csv'

def download_hf_dataset_to_csv():
    os.makedirs(LOCAL_DIR, exist_ok=True)
    dataset_stream = load_dataset("Soft2012/sql_fine_tune_dataset", split="train", streaming=True)
    records = []
    for i, record in enumerate(dataset_stream):
        if i >= 10000:
            break
        records.append(record)
    df = pd.DataFrame(records)
    df.to_csv(LOCAL_PATH, index=False)
    print(f"Sampled dataset saved locally at {LOCAL_PATH}")

def upload_csv_to_s3():
    s3 = S3Hook(aws_conn_id='aws_default')
    # Uncomment below to enable upload
    # s3.load_file(
    #     filename=LOCAL_PATH,
    #     key=S3_KEY,
    #     bucket_name=BUCKET_NAME,
    #     replace=True
    # )
    print(f"(Upload to S3 is commented out) Would upload {LOCAL_PATH} to s3://{BUCKET_NAME}/{S3_KEY}")

def download_csv_from_s3():
    s3 = S3Hook(aws_conn_id='aws_default')
    os.makedirs(LOCAL_DIR, exist_ok=True)

    # Uncomment below to enable download
    # s3.download_file(
    #     key=S3_KEY,
    #     bucket_name=BUCKET_NAME,
    #     local_path=LOCAL_PATH
    # )
    print(f"(Download from S3 is commented out) Would download s3://{BUCKET_NAME}/{S3_KEY} to {LOCAL_PATH}")

    # Create empty CSV file if not exists to avoid read error
    if not os.path.exists(LOCAL_PATH):
        print(f"{LOCAL_PATH} does not exist, creating empty CSV.")
        pd.DataFrame().to_csv(LOCAL_PATH)

    df = pd.read_csv(LOCAL_PATH)
    df_clean = df.dropna()
    df_clean.to_csv(LOCAL_CLEANED_PATH, index=False)
    print(f"Cleaned dataset saved to {LOCAL_CLEANED_PATH}")

default_args = {
    'start_date': datetime(2025, 1, 1),
}

with DAG(
    dag_id='hf_to_s3_etl',
    default_args=default_args,
    schedule='@daily',
    catchup=False,
) as dag:

    download_task = PythonOperator(
        task_id='download_hf_dataset_to_csv',
        python_callable=download_hf_dataset_to_csv,
    )

    upload_task = PythonOperator(
        task_id='upload_csv_to_s3',
        python_callable=upload_csv_to_s3,
    )

    download_s3_task = PythonOperator(
        task_id='download_csv_from_s3',
        python_callable=download_csv_from_s3,
    )

    download_task >> upload_task >> download_s3_task
