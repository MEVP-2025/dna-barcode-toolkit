import os
import glob
import sys

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', 1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', 1)

def process_assembled_fastq(directory = "/app/data/outputs/pear"):
    assembled_files = {}

    pattern = os.path.join(directory, '*.assembled.fastq') # -- output/pear_output/*.assembled.fastq
    files = glob.glob(pattern) # -- ['xxx.assembled.fastq', 'yyy.assembled.fastq', 'zzz.assembled.fastq']
    print(pattern)
    print(files)

    for file_path in files:
        filename = os.path.basename(file_path)
        sample_name = filename.replace('.assembled.fastq', '')

        assembled_files[sample_name] = file_path
        print(f"Find the archive: {sample_name} -> {file_path}", flush=True)

    return assembled_files


def convert_fq_to_fa_and_filter(fastq_file, output_file, delete_seq_file, min_length = 200):
    with open(fastq_file, 'r') as f_in, open(output_file, 'w') as f_out, open(delete_seq_file, 'w') as f_del:
        lines = f_in.readlines()
        for i in range(0, len(lines), 4):
            header = lines[i].strip().replace('@', '>', 1)
            sequence = lines[i+1].strip()

            if len(sequence) >= min_length:
                f_out.write(f"{header}\n{sequence}\n")
            else:
                f_del.write(f"{header}\n{sequence}\n")


def filter_and_convert(assembled_files, min_length):
    output_dir = "/app/data/outputs/filter"
    os.makedirs(output_dir, exist_ok = True) # -- if the file "output_dir" is empty, create

    delete_dir = "/app/data/outputs/filter_del"
    os.makedirs(delete_dir, exist_ok = True)

    if not assembled_files:
        return

    for sample_name, fastq_file in assembled_files.items():
        output_path = os.path.join(output_dir, f"{sample_name}.assembled.len.fasta")
        delete_seq_file = os.path.join(delete_dir, f"{sample_name}.assembled.del.fasta")
        print(output_path, flush=True)
        convert_fq_to_fa_and_filter(fastq_file, output_path, delete_seq_file, min_length)


if __name__ == "__main__":
    min_length = int(sys.argv[1])
    assembled_files = process_assembled_fastq()
    filter_and_convert(assembled_files, min_length)
