from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from datasets import load_dataset
import pandas as pd
import os
from datetime import datetime

# Configurations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASETS = [
    "Soft2012/sql_fine_tune_dataset",
    "dataset2_name",
    "dataset3_name",
    "dataset4_name",
]

def create_paths(dataset_name):
    safe_name = dataset_name.replace('/', '_')
    local_dir = os.path.join(BASE_DIR, 'dataset_storage', safe_name)
    local_path = os.path.join(local_dir, f'{safe_name}.csv')
    local_cleaned_path = os.path.join(local_dir, f'cleaned_{safe_name}.csv')
    s3_key = f'datasets/{safe_name}.csv'
    return local_dir, local_path, local_cleaned_path, s3_key

def download_hf_dataset_to_csv(dataset_name):
    local_dir, local_path, _, _ = create_paths(dataset_name)
    os.makedirs(local_dir, exist_ok=True)
    dataset_stream = load_dataset(dataset_name, split="train", streaming=True)
    records = []
    for i, record in enumerate(dataset_stream):
        if i >= 10000:
            break
        records.append(record)
    df = pd.DataFrame(records)
    df.to_csv(local_path, index=False)
    print(f"{dataset_name}: dataset saved locally at {local_path}")

def upload_csv_to_s3(dataset_name):
    _, local_path, _, s3_key = create_paths(dataset_name)
    s3 = S3Hook(aws_conn_id='aws_default')
    # Uncomment to enable actual upload
    # s3.load_file(
    #     filename=local_path,
    #     key=s3_key,
    #     bucket_name='your-s3-bucket',
    #     replace=True
    # )
    print(f"{dataset_name}: (Upload disabled) Would upload {local_path} to s3://your-s3-bucket/{s3_key}")

def download_csv_from_s3(dataset_name):
    local_dir, local_path, local_cleaned_path, s3_key = create_paths(dataset_name)
    os.makedirs(local_dir, exist_ok=True)
    s3 = S3Hook(aws_conn_id='aws_default')
    # Uncomment to enable actual download
    # s3.download_file(
    #     key=s3_key,
    #     bucket_name='your-s3-bucket',
    #     local_path=local_path
    # )
    print(f"{dataset_name}: (Download disabled) Would download s3://your-s3-bucket/{s3_key} to {local_path}")

    if not os.path.exists(local_path):
        print(f"{local_path} does not exist, creating empty CSV.")
        pd.DataFrame().to_csv(local_path)

    df = pd.read_csv(local_path)
    df_clean = df.dropna()
    df_clean.to_csv(local_cleaned_path, index=False)
    print(f"{dataset_name}: cleaned dataset saved to {local_cleaned_path}")

default_args = {
    'start_date': datetime(2025, 1, 1),
}

with DAG(
    dag_id='parallel_hf_datasets_etl',
    default_args=default_args,
    schedule='@daily',
    catchup=False,
) as dag:

    for ds in DATASETS:
        download_task = PythonOperator(
            task_id=f'download_{ds.replace("/", "_")}',
            python_callable=download_hf_dataset_to_csv,
            op_kwargs={'dataset_name': ds},
        )
        upload_task = PythonOperator(
            task_id=f'upload_{ds.replace("/", "_")}',
            python_callable=upload_csv_to_s3,
            op_kwargs={'dataset_name': ds},
        )
        download_s3_task = PythonOperator(
            task_id=f'download_s3_{ds.replace("/", "_")}',
            python_callable=download_csv_from_s3,
            op_kwargs={'dataset_name': ds},
        )

        download_task >> upload_task >> download_s3_task
