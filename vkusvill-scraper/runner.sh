#!/bin/bash

# Cd to dir of this script
cd "$(dirname "$0")"

# url="https://vkusvill.ru/goods/batonchik-lesnoy-orekh-s-nugoy-i-karamelyu-83446.html"
# python3 vkusvill.py --url $url --cookies msk_v2.json --force-reparse
# exit 0

# # python3 vkusvill.py --cookies msk_zao.json
# exit 0

# csv_path="data/gotovaya-eda/gotovaya-eda_product_urls.csv"
# python3 vkusvill.py --check-availability $csv_path
# exit 0

# url="https://vkusvill.ru/goods/golubtsy-lenivye-v-smetannom-souse-29522.html"
# url="https://vkusvill.ru/goods/kombucha-s-medom-330-ml-80101.html"
# url="https://vkusvill.ru/goods/moloko-3-2-1-l-173.html"
# url="https://vkusvill.ru/goods/voda-pitevaya-negazirovannaya-1-5-l-373.html"
# url="https://vkusvill.ru/goods/sendvich-s-kuritsey-bekonom-i-omletom-kafe-104962.html"
url="https://vkusvill.ru/goods/limony-730.html"
url="https://vkusvill.ru/goods/ikra-seldi-proboynaya-solyenaya-okhl-90-g-105708.html"
url="https://vkusvill.ru/goods/syr-myagkiy-s-beloy-plesenyu-bri-125-g-86091.html"
url="https://vkusvill.ru/goods/syr-parmezan-molodoy-15807.html"
# python3 vkusvill.py --url $url
# exit 0

base_url="https://vkusvill.ru/goods/"
categories=(\
"morozhenoe"
"gotovaya-eda"
"sladosti-i-deserty"
"ovoshchi-frukty-yagody-zelen"
"vsye-nuzhnoe-letom"
"khleb-i-vypechka"
"vypekaem-sami"
"molochnye-produkty-yaytso"
"myaso-ptitsa"
"ryba-ikra-i-moreprodukty"
"kolbasa-sosiski-delikatesy"
"zamorozhennye-produkty"
"shefvill-zapech-i-gotovo"
"syry"
"napitki"
"kafe"
"kukhnya-vkusvill"
"orekhi-chipsy-i-sneki"
"supermarket"
# "tovary-dlya-detey"
"vegetarianskoe-i-postnoe"
"osoboe-pitanie"
"krupy-makarony-muka"
# "alkogol"
"konservatsiya"
"chay-i-kofe"
"masla-sousy-spetsii-sakhar-i-sol"
# "kosmetika-sredstva-gigieny"
# "tovary-dlya-doma-i-kukhni"
# "sad-i-ogorod"
# "tovary-dlya-zhivotnykh"
# "idei-dlya-podarkov"
# "svezhie-tsvety"
"zdorove"
"indilavka"
# "apteka"
# "dobraya-polka"
)

# categories=(
#     "tovary-dlya-detey"
#     "alkogol"
#     "kosmetika-sredstva-gigieny"
#     "tovary-dlya-doma-i-kukhni"
#     "sad-i-ogorod"
#     "tovary-dlya-zhivotnykh"
#     "idei-dlya-podarkov"
#     "svezhie-tsvety"
#     "apteka"
#     "dobraya-polka"
# )

# categories=("vypekaem-sami")

for category in "${categories[@]}"; do
    category_url="$base_url$category/"
    python3 vkusvill.py --category-url $category_url --force-reparse
done
