#!/usr/bin/python3

"""
to generate location vs. haplotype table for multiple species
Batch processing for all species in separated directory
"""

import sys
import os
import glob

def load_location(csv_file, target_species):
    """Load location list from CSV file for specific species"""
    locations = set()
    
    try:
        with open(csv_file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                
                parts = line.split(',')
                if len(parts) >= 1:
                    sample_id = parts[0]  # e.g., "ZpDL_Bie"
                    
                    if '_' in sample_id:
                        species_part, location = sample_id.split('_', 1)
                        
                        # Check if this matches our target species
                        if species_part == target_species:
                            locations.add(location)
        
        locations = sorted(list(locations))
    
    except FileNotFoundError:
        print(f"Warning: Location mapping file {csv_file} not found", flush=True)
        return []
    except Exception as e:
        print(f"Error reading location mapping: {e}", flush=True)
        return []
    
    return locations



def generate_haplotype_table(input_file, output_file, locations):
    dt = {}
    haplotypes = []

    print(f"Processing: {input_file.split('/')[-1]}")
    
    with open(input_file, 'r') as f:
        for i, line in enumerate(f):
            line = line.rstrip()
            
            if not line:
                continue

            parts = line.split('\t')
            if len(parts) != 2:
                continue
                
            # -- hap_info = >hap_0_5
            hap_info, all_read_IDs = parts

            hap_index = hap_info.split('_')[1] # >hap_0_5 -> 0

            all_read_IDs = all_read_IDs.split(',')

            if hap_index not in haplotypes:
                haplotypes.append(hap_index)

            for read_ID in all_read_IDs:
                read_parts = read_ID.split('_')
                if len(read_parts) >= 4:
                    location = read_parts[3]

                    k = location + '_' + hap_index

                    if k in dt:
                        dt[k] += 1
                    else:
                        dt[k] = 1

    # haplotypes = sorted(haplotypes, key=lambda x: int(x) if x.isdigit() else float('inf'))
    
    # print(f"Found haplotypes: {haplotypes}")

    with open(output_file, 'w') as outfile:
        header = 'locations,total,' + ','.join(haplotypes) + '\n'
        outfile.write(header)
        # print(f"Header: {header.strip()}")

        for loc in locations:
            total_in_loc = 0
            tmp = []
            
            for hap in haplotypes:
                k = loc + '_' + hap
                if k in dt:
                    count = dt[k] # dt[k] => ex. dt[Bie_0] = 3 (count = 3)
                    tmp.append(str(count))
                    total_in_loc += count
                else:
                    tmp.append('0')
            
            output_line = loc + ',' + str(total_in_loc) + ',' + ','.join(tmp)
            outfile.write(output_line + '\n')
            # print(output_line)
    
    print(f"Output: {output_file.split('/')[-1]}", flush=True)
    print("-" * 50, flush=True)

if __name__ == "__main__":
    input_dir = "/app/data/outputs/separated"
    output_dir = "/app/data/outputs/table"

    barcodeFile = sys.argv[1]

    os.makedirs(output_dir, exist_ok=True)

    # -- get species
    species_dirs = [d for d in os.listdir(input_dir) 
                    if os.path.isdir(os.path.join(input_dir, d))]

    # print("species_dirs:", species_dirs, flush=True)
    
    if not species_dirs:
        print(f"No species directories found in {input_dir}", flush=True)
    
    print(f"Found {len(species_dirs)} species directories:", flush=True)
    for species in species_dirs:
        print(f"  - {species}", flush=True)
    print("-" * 50, flush=True)

    project = str(species_dirs[0].split('_')[0])
    locations = load_location(barcodeFile, project)

    # -- Proces each species
    for species in species_dirs:
        species_input_dir = os.path.join(input_dir, species)
        species_output_dir = os.path.join(output_dir, species)
        
        os.makedirs(species_output_dir, exist_ok=True)
        
        # -- Look for .dup.list file
        dup_list_pattern = os.path.join(species_input_dir, "*.dup.list")
        dup_list_files = glob.glob(dup_list_pattern)
        
        if not dup_list_files:
            print(f"Warning: No .dup.list file found for {species}", flush=True)
            continue
        
        if len(dup_list_files) > 1:
            print(f"Warning: Multiple .dup.list files found for {species}, using first one", flush=True)
        
        input_file = dup_list_files[0]
        
        # -- output file name
        base_name = os.path.basename(input_file).replace('.dup.list', '')
        output_file = os.path.join(species_output_dir, f"{base_name}.tbl.csv")
        
        # -- process species
        try:
            generate_haplotype_table(input_file, output_file, locations)
        except Exception as e:
            print(f"Error processing {species}: {e}", flush=True)
            continue

    print("All species processed!", flush=True)