from PIL import Image
import numpy as np

def add_margin():
    try:
        # Open the image
        img = Image.open('Logo_Rounded.png')
        
        # Get original dimensions
        width, height = img.size
        
        # Calculate margin size (20% of original dimensions)
        margin_w = int(width * 0.2)
        margin_h = int(height * 0.2)
        
        # Create new image with margins
        new_width = width + (2 * margin_w)
        new_height = height + (2 * margin_h)
        
        # Create new transparent background image
        new_img = Image.new('RGBA', (new_width, new_height), (0, 0, 0, 0))
        
        # Paste original image in center
        new_img.paste(img, (margin_w, margin_h), img)
        
        # Save new image
        new_img.save('Logo_Rounded_with_margin.png', quality=95)
        
        print(f'Created new image with dimensions {new_width}x{new_height}')
        
    except Exception as e:
        print(f'Error processing image: {e}')

if __name__ == '__main__':
    add_margin()
