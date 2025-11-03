from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from datasets import load_dataset
import pandas as pd
import os
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Configs for Dataset 1
LOCAL_DIR1 = os.path.join(BASE_DIR, 'dataset_storage/dataset1')
LOCAL_PATH1 = os.path.join(LOCAL_DIR1, 'dataset1.csv')
LOCAL_CLEANED_PATH1 = os.path.join(LOCAL_DIR1, 'cleaned_dataset1.csv')
S3_KEY1 = 'datasets/dataset1.csv'
DATASET_NAME1 = "Soft2012/sql_fine_tune_dataset"

# Configs for Dataset 2
LOCAL_DIR2 = os.path.join(BASE_DIR, 'dataset_storage/dataset2')
LOCAL_PATH2 = os.path.join(LOCAL_DIR2, 'dataset2.csv')
LOCAL_CLEANED_PATH2 = os.path.join(LOCAL_DIR2, 'cleaned_dataset2.csv')
S3_KEY2 = 'datasets/dataset2.csv'
DATASET_NAME2 = "Soft2012/sql_fine_tune_dataset"

# Configs for Dataset 3
LOCAL_DIR3 = os.path.join(BASE_DIR, 'dataset_storage/dataset3')
LOCAL_PATH3 = os.path.join(LOCAL_DIR3, 'dataset3.csv')
LOCAL_CLEANED_PATH3 = os.path.join(LOCAL_DIR3, 'cleaned_dataset3.csv')
S3_KEY3 = 'datasets/dataset3.csv'
DATASET_NAME3 = "Soft2012/sql_fine_tune_dataset"

# Configs for Dataset 4
LOCAL_DIR4 = os.path.join(BASE_DIR, 'dataset_storage/dataset4')
LOCAL_PATH4 = os.path.join(LOCAL_DIR4, 'dataset4.csv')
LOCAL_CLEANED_PATH4 = os.path.join(LOCAL_DIR4, 'cleaned_dataset4.csv')
S3_KEY4 = 'datasets/dataset4.csv'
DATASET_NAME4 = "Soft2012/sql_fine_tune_dataset"

# S3 bucket
BUCKET_NAME = 'your-s3-bucket'

def download_dataset_1():
    os.makedirs(LOCAL_DIR1, exist_ok=True)
    dataset_stream = load_dataset(DATASET_NAME1, split="train", streaming=True)
    records = []
    for i, record in enumerate(dataset_stream):
        if i >= 10000: break
        records.append(record)
    df = pd.DataFrame(records)
    df.to_csv(LOCAL_PATH1, index=False)
    print(f"Dataset1 saved at {LOCAL_PATH1}")

def upload_dataset_1():
    s3 = S3Hook(aws_conn_id='aws_default')
    # s3.load_file(filename=LOCAL_PATH1, key=S3_KEY1, bucket_name=BUCKET_NAME, replace=True)
    print(f"(Upload Dataset1 commented) Would upload {LOCAL_PATH1} to s3://{BUCKET_NAME}/{S3_KEY1}")

def download_and_clean_dataset_1():
    s3 = S3Hook(aws_conn_id='aws_default')
    os.makedirs(LOCAL_DIR1, exist_ok=True)
    # s3.download_file(key=S3_KEY1, bucket_name=BUCKET_NAME, local_path=LOCAL_PATH1)
    if not os.path.exists(LOCAL_PATH1):
        pd.DataFrame().to_csv(LOCAL_PATH1)
    df = pd.read_csv(LOCAL_PATH1)
    df_clean = df.dropna()
    df_clean.to_csv(LOCAL_CLEANED_PATH1, index=False)
    print(f"Cleaned dataset1 saved at {LOCAL_CLEANED_PATH1}")

# Repeat above three functions for dataset 2
def download_dataset_2():
    os.makedirs(LOCAL_DIR2, exist_ok=True)
    dataset_stream = load_dataset(DATASET_NAME2, split="train", streaming=True)
    records = []
    for i, record in enumerate(dataset_stream):
        if i >= 10000: break
        records.append(record)
    df = pd.DataFrame(records)
    df.to_csv(LOCAL_PATH2, index=False)
    print(f"Dataset2 saved at {LOCAL_PATH2}")

def upload_dataset_2():
    s3 = S3Hook(aws_conn_id='aws_default')
    # s3.load_file(filename=LOCAL_PATH2, key=S3_KEY2, bucket_name=BUCKET_NAME, replace=True)
    print(f"(Upload Dataset2 commented) Would upload {LOCAL_PATH2} to s3://{BUCKET_NAME}/{S3_KEY2}")

def download_and_clean_dataset_2():
    s3 = S3Hook(aws_conn_id='aws_default')
    os.makedirs(LOCAL_DIR2, exist_ok=True)
    # s3.download_file(key=S3_KEY2, bucket_name=BUCKET_NAME, local_path=LOCAL_PATH2)
    if not os.path.exists(LOCAL_PATH2):
        pd.DataFrame().to_csv(LOCAL_PATH2)
    df = pd.read_csv(LOCAL_PATH2)
    df_clean = df.dropna()
    df_clean.to_csv(LOCAL_CLEANED_PATH2, index=False)
    print(f"Cleaned dataset2 saved at {LOCAL_CLEANED_PATH2}")

# Similar code for dataset 3
def download_dataset_3():
    os.makedirs(LOCAL_DIR3, exist_ok=True)
    dataset_stream = load_dataset(DATASET_NAME3, split="train", streaming=True)
    records = []
    for i, record in enumerate(dataset_stream):
        if i >= 10000: break
        records.append(record)
    df = pd.DataFrame(records)
    df.to_csv(LOCAL_PATH3, index=False)
    print(f"Dataset3 saved at {LOCAL_PATH3}")

def upload_dataset_3():
    s3 = S3Hook(aws_conn_id='aws_default')
    # s3.load_file(filename=LOCAL_PATH3, key=S3_KEY3, bucket_name=BUCKET_NAME, replace=True)
    print(f"(Upload Dataset3 commented) Would upload {LOCAL_PATH3} to s3://{BUCKET_NAME}/{S3_KEY3}")

def download_and_clean_dataset_3():
    s3 = S3Hook(aws_conn_id='aws_default')
    os.makedirs(LOCAL_DIR3, exist_ok=True)
    # s3.download_file(key=S3_KEY3, bucket_name=BUCKET_NAME, local_path=LOCAL_PATH3)
    if not os.path.exists(LOCAL_PATH3):
        pd.DataFrame().to_csv(LOCAL_PATH3)
    df = pd.read_csv(LOCAL_PATH3)
    df_clean = df.dropna()
    df_clean.to_csv(LOCAL_CLEANED_PATH3, index=False)
    print(f"Cleaned dataset3 saved at {LOCAL_CLEANED_PATH3}")

# Dataset 4
def download_dataset_4():
    os.makedirs(LOCAL_DIR4, exist_ok=True)
    dataset_stream = load_dataset(DATASET_NAME4, split="train", streaming=True)
    records = []
    for i, record in enumerate(dataset_stream):
        if i >= 10000:
            break
        records.append(record)
    df = pd.DataFrame(records)
    df.to_csv(LOCAL_PATH4, index=False)
    print(f"Dataset4 saved at {LOCAL_PATH4}")

def upload_dataset_4():
    s3 = S3Hook(aws_conn_id='aws_default')
    # s3.load_file(filename=LOCAL_PATH4, key=S3_KEY4, bucket_name=BUCKET_NAME, replace=True)
    print(f"(Upload Dataset4 commented) Would upload {LOCAL_PATH4} to s3://{BUCKET_NAME}/{S3_KEY4}")

def download_and_clean_dataset_4():
    s3 = S3Hook(aws_conn_id='aws_default')
    os.makedirs(LOCAL_DIR4, exist_ok=True)
    # s3.download_file(key=S3_KEY4, bucket_name=BUCKET_NAME, local_path=LOCAL_PATH4)
    if not os.path.exists(LOCAL_PATH4):
        pd.DataFrame().to_csv(LOCAL_PATH4)
    df = pd.read_csv(LOCAL_PATH4)
    df_clean = df.dropna()
    df_clean.to_csv(LOCAL_CLEANED_PATH4, index=False)
    print(f"Cleaned dataset4 saved at {LOCAL_CLEANED_PATH4}")

default_args = {'start_date': datetime(2025, 1, 1)}

with DAG('multiple_datasets_etl', default_args=default_args, schedule='@daily', catchup=False) as dag:

    # Dataset 1 tasks
    ds1_download = PythonOperator(task_id='download_dataset1', python_callable=download_dataset_1)
    ds1_upload = PythonOperator(task_id='upload_dataset1', python_callable=upload_dataset_1)
    ds1_download_s3 = PythonOperator(task_id='download_clean_dataset1', python_callable=download_and_clean_dataset_1)
    ds1_download >> ds1_upload >> ds1_download_s3

    # Dataset 2 tasks
    ds2_download = PythonOperator(task_id='download_dataset2', python_callable=download_dataset_2)
    ds2_upload = PythonOperator(task_id='upload_dataset2', python_callable=upload_dataset_2)
    ds2_download_s3 = PythonOperator(task_id='download_clean_dataset2', python_callable=download_and_clean_dataset_2)
    ds2_download >> ds2_upload >> ds2_download_s3

    # Dataset 3 tasks
    ds3_download = PythonOperator(task_id='download_dataset3', python_callable=download_dataset_3)
    ds3_upload = PythonOperator(task_id='upload_dataset3', python_callable=upload_dataset_3)
    ds3_download_s3 = PythonOperator(task_id='download_clean_dataset3', python_callable=download_and_clean_dataset_3)
    ds3_download >> ds3_upload >> ds3_download_s3

    # Dataset 4 tasks
    ds4_download = PythonOperator(task_id='download_dataset4', python_callable=download_dataset_4)
    ds4_upload = PythonOperator(task_id='upload_dataset4', python_callable=upload_dataset_4)
    ds4_download_s3 = PythonOperator(task_id='download_clean_dataset4', python_callable=download_and_clean_dataset_4)
    ds4_download >> ds4_upload >> ds4_download_s3
