from PIL import Image
from collections import Counter

img = Image.open(r'c:\Users\Yufeng.Liang\Documents\econoter2\public\assets\cat\chibi-cat-eating-sprite-sheet\assets\chibi-cat-eating-sprite-sheet-2048.jpg')
img = img.convert('RGB')

pixels = list(img.getdata())
counter = Counter(pixels)
print('Top 20 colors:', counter.most_common(20))

corners = [
    img.getpixel((0, 0)),
    img.getpixel((img.width - 1, 0)),
    img.getpixel((0, img.height - 1)),
    img.getpixel((img.width - 1, img.height - 1)),
]
print('Corners:', corners)
