#!/usr/bin/env python3

import sys
import os
from pathlib import Path

blnfile_name = Path(sys.argv[1])	# "Zp.dloop.bln" #"Zp.dloop.bln.species"
species_name = blnfile_name.name.split('.')[0] # -- select all names before the first "."

output_dir = Path("/workspace/output/assign_output/")
output_dir.mkdir(parents=True, exist_ok=True)

outfile_path = output_dir / f"{species_name}.assign.species"
outfile = open(outfile_path, "w")

# -- read bln+species file
dt = {}
with open(blnfile_name, 'r', encoding='utf-8') as file:
    for i, line in enumerate(file):
        # print(i)

        #if i > 1000: break

        line = line.rstrip()
        fields = line.split(',')

        read_id = fields[0]
        identity = float(fields[2])
        species = fields[1] #fields[12]

        try:
            ref_id, ref_rest = species.split('.1:')
            species_name = '_'.join(ref_rest.split('_')[1:3])
        except:
            species_name = '_'.join(species.split('_')[1:3])

        # -- NC_028595.1:1568816615_Opsariichthys_acutipinnis_voucher_FDZMAJ20140501_mitochondrion_complete_genome
        # -- AY332785.1_Opsariichthys_evolans_haplotype_ZL07_control_region_partial_sequence_mitochondrial
        # -- LC098421.1_Zacco_platypus_mitochondrial_DNA_control_region_partial_sequence_isolate:_G204

        if read_id in dt.keys():
            dt[read_id].extend([[species_name, species, identity, line]])
        else:
            dt[read_id] = [[species_name, species, identity, line]]

for read_id in dt.keys():
    print(read_id, end=' ')
    
    # -- check "mitochondrion" + identity > 98
    priority = 0 
    for i, hit in enumerate(dt[read_id]):
        species_name, species, identity, line = hit
        full_species_info = species.split('_')

        if "mitochondrion" in full_species_info and identity >= 98:
            print_line = species_name + ',' + str(identity) + ',' + line
            priority = 1
            break
        elif identity >= 98:
            print_line = species_name + ',' + str(identity) + ',' + line
            priority = 1
            break

    # -- if the above is not available, start from first, skip "Zacco platypus" 
    secondary = 0
    if not priority:
        for i, hit in enumerate(dt[read_id]):
            species_name, species, identity, line = hit
            full_species_info = species.split('_')
            # if "Zacco_platypus" == species_name: 
            #     pass
            # else:
                print_line = species_name + ',' + str(identity) + ',' + line
                secondary = 1
                break

    # -- if not the aboves, choose the first one
    if not priority and not secondary: 
        species_name, species, identity, line = dt[read_id][0]
        full_species_info = species.split('_')
        print_line = species_name + ',' + str(identity) + ',' + line

    outfile.write(read_id + ',' + print_line + '\n')

outfile.close()