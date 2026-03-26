import os
import io
from rembg import remove
from PIL import Image

def process_sprites(sprite_dir):
    """
    Remove backgrounds from all images in the sprite_dir using rembg
    """
    if not os.path.exists(sprite_dir):
        print(f"Error: Directory {sprite_dir} not found.")
        return

    processed_count = 0
    for filename in os.listdir(sprite_dir):
        if filename.lower().endswith(('.webp', '.png', '.jpg', '.jpeg')):
            input_path = os.path.join(sprite_dir, filename)
            # We'll save as .webp to ensure transparency and consistency
            output_filename = os.path.splitext(filename)[0] + ".webp"
            output_path = os.path.join(sprite_dir, output_filename)

            print(f"Processing {filename} -> {output_filename}...")
            try:
                with open(input_path, 'rb') as i:
                    input_data = i.read()
                    # rembg.remove returns a bytes object
                    output_data = remove(input_data)
                    
                    # Open bytes as an image
                    img = Image.open(io.BytesIO(output_data))
                    # Save with transparency (RGBA)
                    img.save(output_path, "WEBP", lossless=True)
                
                # If the extension changed, delete the old file
                if input_path != output_path and os.path.exists(input_path):
                    os.remove(input_path)
                    print(f"Removed old file: {input_path}")
                
                processed_count += 1
                print(f"Successfully processed {filename}")
            except Exception as e:
                print(f"Failed to process {filename}: {str(e)}")

    print(f"\nBackground removal complete. Processed {processed_count} files.")

if __name__ == "__main__":
    # Path relative to the script's directory or root depending on how it's called
    # Root: second-brain-ai/frontend/src/assets/sprites/
    target_dir = "second-brain-ai/frontend/src/assets/sprites"
    process_sprites(target_dir)
