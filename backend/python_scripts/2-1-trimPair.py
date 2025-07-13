#!/usr/bin/env python3

"""
Optimized barcode and primer trimming tool for paired-end sequencing data.
Trims barcodes and primers from the beginning of reads.
Input: barcode file (all-tags.csv), R1 and R2 FASTQ files
Output: Species-specific trimmed FASTQ files
"""

import sys
import os
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Optional, TextIO


class FastqRecord:
    """Represents a single FASTQ record with header, sequence, and quality."""
    
    def __init__(self, header: str, sequence: str, quality: str):
        self.header = header
        self.sequence = sequence
        self.quality = quality
        self.index = self._extract_index()
    
    def _extract_index(self) -> str:
        """Extract read index from header."""
        return self.header.split('_')[1] if '_' in self.header else ""
    
    def trim_sequence(self, trim_length: int) -> 'FastqRecord':
        """Return a new FastqRecord with trimmed sequence and quality."""
        return FastqRecord(
            self.header,
            self.sequence[trim_length:],
            self.quality[trim_length:]
        )


class BarcodeDatabase:
    """Manages barcode and primer sequences."""
    
    def __init__(self, tagfile: str):
        self.tags = {}
        self.species_prefixes = set()
        self._load_tags(tagfile)
    
    def _load_tags(self, tagfile: str) -> None:
        """Load barcode and primer sequences from CSV file."""
        with open(tagfile, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                    
                fields = line.split(',')
                if len(fields) >= 7:
                    location = fields[0]
                    # Store: barcode_f, primer_f, barcode_r, primer_r
                    self.tags[location] = fields[3:7]
                    
                    # Extract species prefix
                    species_prefix = location.split('_')[0] if '_' in location else location
                    self.species_prefixes.add(species_prefix)
    
    def get_combined_tags(self, location: str) -> Tuple[str, str]:
        """Get combined forward and reverse tags for a location."""
        barcode_f, primer_f, barcode_r, primer_r = self.tags[location]
        return barcode_f + primer_f, barcode_r + primer_r


class FastqProcessor:
    """Processes paired-end FASTQ files."""
    
    def __init__(self, r1_file: str, r2_file: str):
        self.r1_file = r1_file
        self.r2_file = r2_file
        self.paired_reads = {}
    
    def load_reads(self) -> None:
        """Load paired-end reads into memory."""
        print("Loading R1 reads...")
        r1_reads = self._load_fastq_file(self.r1_file)
        
        print("Loading R2 reads...")
        r2_reads = self._load_fastq_file(self.r2_file)
        
        # Combine R1 and R2 reads
        for index in r1_reads:
            if index in r2_reads:
                self.paired_reads[index] = (r1_reads[index], r2_reads[index])
        
        print(f"Loaded {len(self.paired_reads)} paired reads")
    
    def _load_fastq_file(self, filename: str) -> Dict[str, FastqRecord]:
        """Load FASTQ file and return dictionary of reads indexed by read index."""
        reads = {}
        
        with open(filename, 'r', encoding='utf-8') as f:
            lines = [line.strip() for line in f]
        
        # Process FASTQ in chunks of 4 lines
        for i in range(0, len(lines), 4):
            if i + 3 < len(lines):
                header = lines[i]
                sequence = lines[i + 1]
                quality = lines[i + 3]
                
                record = FastqRecord(header, sequence, quality)
                if record.index:
                    reads[record.index] = record
        
        return reads


class SequenceMatcher:
    """Handles sequence matching and mismatch calculation."""
    
    @staticmethod
    def hamming_distance(seq1: str, seq2: str) -> int:
        """Calculate Hamming distance between two sequences of equal length."""
        if len(seq1) != len(seq2):
            return float('inf')
        
        return sum(c1 != c2 for c1, c2 in zip(seq1.upper(), seq2.upper()))
    
    @staticmethod
    def find_best_orientation(tag_f: str, tag_r: str, r1_seq: str, r2_seq: str) -> Tuple[str, int, int, int, int]:
        """
        Find the best orientation for tag matching.
        Returns: (orientation, mismatch_f, mismatch_r, len_tag_f, len_tag_r)
        """
        len_tag_f = len(tag_f)
        len_tag_r = len(tag_r)
        
        # R1f + R2r orientation
        mismatch_r1f = SequenceMatcher.hamming_distance(tag_f, r1_seq[:len_tag_f])
        mismatch_r2r = SequenceMatcher.hamming_distance(tag_r, r2_seq[:len_tag_r])
        r1f_total = mismatch_r1f + mismatch_r2r
        
        # R2f + R1r orientation
        mismatch_r2f = SequenceMatcher.hamming_distance(tag_f, r2_seq[:len_tag_f])
        mismatch_r1r = SequenceMatcher.hamming_distance(tag_r, r1_seq[:len_tag_r])
        r2f_total = mismatch_r2f + mismatch_r1r
        
        if r1f_total <= r2f_total:
            return "R1f", mismatch_r1f, mismatch_r2r, len_tag_f, len_tag_r
        else:
            return "R2f", mismatch_r2f, mismatch_r1r, len_tag_f, len_tag_r


class OutputManager:
    """Manages output files for different species."""
    
    def __init__(self, output_dir: str = "output_files"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.file_handles = {}
        
        # Quality standards for different species
        self.quality_standards = {
            'xworm': {'max_mismatch': 9},
            'ZpDL': {'max_mismatch': 0},
            'CypDL': {'max_mismatch': 9},
        }
    
    def open_output_files(self, species_prefixes: set) -> None:
        """Open output files for all species."""
        for species in species_prefixes:
            self.file_handles[species] = {
                'F': open(self.output_dir / f"{species}.f.fq", 'w', encoding='utf-8'),
                'R': open(self.output_dir / f"{species}.r.fq", 'w', encoding='utf-8')
            }
    
    def close_all_files(self) -> None:
        """Close all open file handles."""
        for species_files in self.file_handles.values():
            for file_handle in species_files.values():
                file_handle.close()
    
    def write_trimmed_reads(self, read_index: str, location: str, orientation: str,
                           r1_record: FastqRecord, r2_record: FastqRecord,
                           mismatch_f: int, mismatch_r: int,
                           f_trim_len: int, r_trim_len: int) -> None:
        """Write trimmed reads to appropriate output files."""
        species_prefix = location.split('_')[0] if '_' in location else location
        
        if species_prefix not in self.file_handles:
            return
        
        # Check quality standards
        max_mismatch = self.quality_standards.get(species_prefix, {'max_mismatch': 0})['max_mismatch']
        
        if mismatch_f > max_mismatch or mismatch_r > max_mismatch:
            return
        
        # Determine correct orientation and trim sequences
        if orientation == "R1f":
            f_record = r1_record.trim_sequence(f_trim_len)
            r_record = r2_record.trim_sequence(r_trim_len)
        else:  # R2f
            f_record = r2_record.trim_sequence(f_trim_len)
            r_record = r1_record.trim_sequence(r_trim_len)
        
        # Write forward read
        f_header = f"@f_{read_index}_{location}_{orientation}"
        self._write_fastq_record(self.file_handles[species_prefix]['F'], 
                                f_header, f_record.sequence, f_record.quality)
        
        # Write reverse read  
        r_header = f"@r_{read_index}_{location}_{orientation}"
        self._write_fastq_record(self.file_handles[species_prefix]['R'],
                                r_header, r_record.sequence, r_record.quality)
    
    def _write_fastq_record(self, file_handle: TextIO, header: str, sequence: str, quality: str) -> None:
        """Write a single FASTQ record to file."""
        file_handle.write(f"{header}\n{sequence}\n+\n{quality}\n")


class BarcodeTrimmingPipeline:
    """Main pipeline for barcode and primer trimming."""
    
    def __init__(self, r1_file: str, r2_file: str, tagfile: str = "data/all-tags.csv"):
        self.r1_file = r1_file
        self.r2_file = r2_file
        self.tagfile = tagfile
        
        # Initialize components
        self.barcode_db = BarcodeDatabase(tagfile)
        self.fastq_processor = FastqProcessor(r1_file, r2_file)
        self.output_manager = OutputManager()
        self.matcher = SequenceMatcher()
        
        # Results tracking
        self.results = {}
    
    def run(self) -> None:
        """Run the complete trimming pipeline."""
        print("Starting barcode and primer trimming pipeline...")
        
        # Load input data
        self.fastq_processor.load_reads()
        
        # Setup output files
        self.output_manager.open_output_files(self.barcode_db.species_prefixes)
        
        try:
            # Process each paired read
            self._process_all_reads()
            
            # Write results
            self._write_results()
            
        finally:
            # Clean up
            self.output_manager.close_all_files()
        
        print("Pipeline completed successfully!")
    
    def _process_all_reads(self) -> None:
        """Process all paired reads for barcode/primer matching."""
        print("Processing reads for barcode/primer matching...")
        
        total_reads = len(self.fastq_processor.paired_reads)
        
        for i, (read_index, (r1_record, r2_record)) in enumerate(self.fastq_processor.paired_reads.items()):
            if i % 1000 == 0:
                print(f"Processed {i}/{total_reads} reads")
            
            best_match = self._find_best_barcode_match(r1_record, r2_record)
            
            if best_match:
                location, orientation, mismatch_f, mismatch_r, f_trim_len, r_trim_len = best_match
                
                # Store results
                self.results[read_index] = {
                    'location': location,
                    'orientation': orientation,
                    'mismatch_f': mismatch_f,
                    'mismatch_r': mismatch_r,
                    'f_trim_len': f_trim_len,
                    'r_trim_len': r_trim_len
                }
                
                # Debug output
                print(f"{read_index},{location},{orientation},{mismatch_f},{mismatch_r}")
    
    def _find_best_barcode_match(self, r1_record: FastqRecord, r2_record: FastqRecord) -> Optional[Tuple]:
        """Find the best barcode match for a read pair."""
        best_mismatch = float('inf')
        best_match = None
        
        for location in self.barcode_db.tags.keys():
            tag_f, tag_r = self.barcode_db.get_combined_tags(location)
            
            orientation, mismatch_f, mismatch_r, f_len, r_len = self.matcher.find_best_orientation(
                tag_f, tag_r, r1_record.sequence, r2_record.sequence
            )
            
            total_mismatch = mismatch_f + mismatch_r
            
            if total_mismatch < best_mismatch:
                best_mismatch = total_mismatch
                best_match = (location, orientation, mismatch_f, mismatch_r, f_len, r_len)
        
        return best_match
    
    def _write_results(self) -> None:
        """Write trimmed reads to output files."""
        print("Writing trimmed reads to output files...")
        
        for read_index, result in self.results.items():
            if read_index in self.fastq_processor.paired_reads:
                r1_record, r2_record = self.fastq_processor.paired_reads[read_index]
                
                self.output_manager.write_trimmed_reads(
                    read_index=read_index,
                    location=result['location'],
                    orientation=result['orientation'],
                    r1_record=r1_record,
                    r2_record=r2_record,
                    mismatch_f=result['mismatch_f'],
                    mismatch_r=result['mismatch_r'],
                    f_trim_len=result['f_trim_len'],
                    r_trim_len=result['r_trim_len']
                )


def main():
    """Main function to run the barcode trimming pipeline."""
    if len(sys.argv) != 3:
        print("Usage: python script.py <R1_fastq> <R2_fastq>")
        sys.exit(1)
    
    r1_file = sys.argv[1]
    r2_file = sys.argv[2]
    
    # Validate input files
    for file_path in [r1_file, r2_file, "data/all-tags.csv"]:
        if not os.path.exists(file_path):
            print(f"Error: File {file_path} not found")
            sys.exit(1)
    
    # Run pipeline
    pipeline = BarcodeTrimmingPipeline(r1_file, r2_file)
    pipeline.run()


if __name__ == "__main__":
    main()