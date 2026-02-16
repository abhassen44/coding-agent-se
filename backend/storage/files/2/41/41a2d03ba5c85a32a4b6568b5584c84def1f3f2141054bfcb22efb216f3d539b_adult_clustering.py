import os
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, trim

os.environ["SPARK_LOCAL_IP"] = "127.0.0.1"

spark = (
    SparkSession.builder
    .appName("AdultClustering")
    .master("local[*]")
    .config("spark.driver.host", "127.0.0.1")
    .config("spark.driver.bindAddress", "127.0.0.1")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("ERROR")

# Load and name columns
file_path = "adult.data"
cols = [
    "age","workclass","fnlwgt","education","education_num","marital_status",
    "occupation","relationship","race","sex","capital_gain","capital_loss",
    "hours_per_week","native_country","income"
]
df = spark.read.csv(file_path, header=False, inferSchema=True).toDF(*cols)

# Trim leading/trailing spaces in all string columns
for c in df.columns:
    if dict(df.dtypes)[c] == 'string':
        df = df.withColumn(c, trim(col(c)))

# i) Country with highest adults except USA
country_counts = (
    df.filter(col("native_country") != "United-States")
      .groupBy("native_country")
      .count()
      .orderBy(col("count").desc())
)
top_country = country_counts.first()

# ii) People with Masters or higher working in Tech-support
masters_count = df.filter(
    ((col("education") == "Masters") | (col("education_num") >= 14)) &
    (col("occupation") == "Tech-support")
).count()

# iii) Unmarried males working in Local-gov
unmarried_count = df.filter(
    (col("sex") == "Male") &
    (col("marital_status") == "Never-married") &
    (col("workclass") == "Local-gov")
).count()

# Save results
os.makedirs("results", exist_ok=True)
with open("results/output.txt", "w") as f:
    f.write(f"Highest adults (non-USA): {top_country['native_country']} ({top_country['count']})\n")
    f.write(f"People with >= Masters in Tech-support: {masters_count}\n")
    f.write(f"Unmarried males in Local-govt: {unmarried_count}\n")

print("✅ Results saved to results/output.txt")

spark.stop()
print("✅ Clean shutdown")
