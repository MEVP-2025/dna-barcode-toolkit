#!/usr/bin/python3
"""
keep fastq 
rename reads by file name using read counts
infile: MS23323-R1.fq
"""
import sys, os 

infile_name = sys.argv[1]	# -- MS23323-R1.fq
outfile_name = infile_name.split('.')[0] + '.rename.fq' 
pair = infile_name.split('_')[-1][0:2]

with open(outfile_name, 'w') as outfile:
    read_counts = 0
    with open(infile_name, 'r') as infile:
        for i, line in enumerate(infile):
            line = line.rstrip()
            if i % 4 == 0: 	# -- bug: line.startswith('@'):
                outfile.write("@" + pair + "_" + str(read_counts))
                outfile.write("\n")
                read_counts += 1
            else:
                outfile.write(line)
                outfile.write("\n")