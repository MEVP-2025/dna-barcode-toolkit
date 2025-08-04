#!/usr/bin/env python3

"""
Species Detection Script
Scans barcode CSV file to detect all species present in the dataset.

Usage: python species_detector.py <barcode_csv>
Output: JSON format with species information
"""

import sys
import json
from pathlib import Path

def detect_species(barcode_file: str) -> dict:
    """
    檢測 barcode 檔案中的所有物種
    
    Args:
        barcode_file: barcode CSV 檔案路徑
        
    Returns:
        dict: 包含物種列表的字典
    """
    species_set = set()
    
    try:
        with open(barcode_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                
                # 跳過空行
                if not line:
                    continue
                    
                # 解析 CSV 行
                fields = line.split(',')
                if len(fields) >= 7:  # 確保有足夠的欄位
                    location = fields[0]
                    
                    # 提取物種前綴（假設格式為 species_location）
                    species_prefix = location.split('_')[0] if '_' in location else location
                    
                    # 添加到物種集合
                    species_set.add(species_prefix)
        
        # 返回物種列表
        result = {
            'species': sorted(list(species_set))  # 排序讓結果更一致
        }
        
        return result
        
    except FileNotFoundError:
        return {'error': f'Barcode file not found: {barcode_file}'}
    except Exception as e:
        return {'error': f'Failed to parse barcode file: {str(e)}'}

def main():
    if len(sys.argv) != 2:
        print(json.dumps({
            'error': 'Invalid arguments',
            'usage': 'python species_detector.py <barcode_csv>'
        }), flush=True)
        sys.exit(1)
    
    barcode_file = sys.argv[1]
    
    # 檢查檔案是否存在
    if not Path(barcode_file).exists():
        print(json.dumps({
            'error': f'File not found: {barcode_file}'
        }), flush=True)
        sys.exit(1)
    
    # 檢測物種
    species_info = detect_species(barcode_file)
    
    # 輸出 JSON 格式給 Node.js 處理
    print(json.dumps(species_info, indent=2), flush=True)

if __name__ == "__main__":
    main()