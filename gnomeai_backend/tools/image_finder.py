import sys
import json
import os

def log(msg):
    sys.stderr.write(f"[MCP Log] {msg}\n")
    sys.stderr.flush()

def count_images_by_folder(directory_path):
    image_exts = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'}
    folder_counts = {}
    
    directory_path = os.path.expanduser(directory_path)
    
    if not os.path.exists(directory_path) or not os.path.isdir(directory_path):
        return f"Error: '{directory_path}' is not a valid directory."
        
    for root, dirs, files in os.walk(directory_path):
        dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', 'venv', '__pycache__', '.idea', '.vscode'}]
        img_count = sum(1 for f in files if os.path.splitext(f)[1].lower() in image_exts)
        if img_count > 0:
            folder_counts[root] = img_count
            
    if not folder_counts:
        return "No image files found in any folder."
        
    sorted_folders = sorted(folder_counts.items(), key=lambda x: x[1], reverse=True)
    res = ["Folders sorted by image count:"]
    for folder, count in sorted_folders[:10]:
        res.append(f"- `{folder}`: {count} images")
    return "\n".join(res)

def main():
    log("ImageFinder MCP started")
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            request = json.loads(line)
            method = request.get("method")
            req_id = request.get("id")
            
            if method == "initialize":
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "image-finder-mcp",
                            "version": "1.0.0"
                        }
                    }
                }
            elif method == "tools/list":
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "tools": [
                            {
                                "name": "count_images_by_folder",
                                "description": "Recursively crawls a directory path and returns a list of directories containing the most image files (e.g. png, jpg, webp, gif, svg).",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "directory_path": {
                                            "type": "string",
                                            "description": "The absolute directory path to analyze."
                                        }
                                    },
                                    "required": ["directory_path"]
                                }
                            }
                        ]
                    }
                }
            elif method == "tools/call":
                params = request.get("params", {})
                tool_name = params.get("name")
                arguments = params.get("arguments", {})
                
                if tool_name == "count_images_by_folder":
                    dir_path = arguments.get("directory_path")
                    result_text = count_images_by_folder(dir_path)
                    response = {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": result_text
                                }
                            ]
                        }
                    }
                else:
                    response = {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {
                            "code": -32601,
                            "message": f"Tool {tool_name} not found"
                        }
                    }
            else:
                if req_id is not None:
                    response = {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {}
                    }
                else:
                    continue
            
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            
        except Exception as e:
            log(f"Error handling request: {e}")

if __name__ == "__main__":
    main()
