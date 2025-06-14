# Cd script directory
cd $(dirname $0)

url="https://www.ozon.ru/product/borshch-s-govyadinoy-300-g-ozon-fresh-1650444606"
url="https://www.ozon.ru/product/farsh-iz-svininy-i-govyadiny-druzhe-domashniy-ohlazhdennyy-400g-1580759276"
url="https://www.ozon.ru/product/fitnesshock-proteinovyy-batonchik-v-shokolade-bez-sahara-shokoladnyy-tryufel-40-gr-1851067148/?at=Z8tXqpBZgUjn5LYJIk534GvC2VJ4DGsNMLOq0UAxpwPN&ectx=1&miniapp=supermarket"
url="https://www.ozon.ru/product/chikalab-proteinovye-batonchiki-chikabar-v-molochnom-shokolade-bez-sahara-assorti-20sht-h-60g-216966673/"
url="https://www.ozon.ru/product/proteinovoe-pechene-e-baton-s-belkovym-sufle-20-belka-assorti-vkusov-9-sht-po-50-g-176008876"
url="https://www.ozon.ru/product/chikalab-proteinovaya-shokoladnaya-pasta-bez-sahara-s-fundukom-250-gramm-226508891/"
url="https://www.ozon.ru/product/chikalab-proteinovye-konfety-drazhe-bez-sahara-kukuruznye-shariki-v-molochnom-shokolade-120g-216966644/"
python3 ozon.py --url "$url"
exit 0

category="https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=%2Fcategory%2Fsupermarket-gotovye-blyuda-9521000%2F%3Flayout_container%3Ddefault%26layout_page_index%3D3%26miniapp%3Dsupermarket%26page%3D3%26paginator_token%3D3635012%26search_page_state%3D2snH2S1CAn_TwdYC-7ZoV1iZCyMug8LJL9IN80YOaOag0t-qMZabhBaE3NJiYs6AAx9PM6zGMXPYo3-6UcXV36iLqNqr77NJfO6j41BTSRV2UpUg4TVDuCZHIcYPw2Q1pI5VZmJS1bt0SQ%253D%253D%26start_page_id%3Dc57b17f8b9176a00df439740c7d49337"
category="https://www.ozon.ru/category/torty-9900000"
category="https://www.ozon.ru/category/ohlazhdennye-napitki-94710000"
category="https://www.ozon.ru/category/supermarket-ovoshchi-frukty-zelen-9201000"
category="https://www.ozon.ru/category/supermarket-gotovye-blyuda-9521000"

categories=(
# "https://www.ozon.ru/highlight/produktsiya-ozon-express-199745"
"https://www.ozon.ru/category/supermarket-gotovye-blyuda-9521000"
"https://www.ozon.ru/category/supermarket-ovoshchi-frukty-zelen-9201000"
"https://www.ozon.ru/category/supermarket-molochnye-produkty-i-yaytsa-9276000"
"https://www.ozon.ru/category/myaso-ptitsa-i-ryba-9971000"
# "https://www.ozon.ru/highlight/novinki-2248824"
"https://www.ozon.ru/category/supermarket-kolbasy-sosiski-delikatesy-9312000"
"https://www.ozon.ru/category/hleb-vypechka-94610000"
"https://www.ozon.ru/category/supermarket-bakaleya-30701000"
"https://www.ozon.ru/category/torty-9900000"
"https://www.ozon.ru/category/supermarket-hleb-vypechka-sladosti-9378000"
"https://www.ozon.ru/category/supermarket-zamorozhennye-produkty-9437000"
"https://www.ozon.ru/category/supermarket-voda-soki-napitki-9467000"
"https://www.ozon.ru/category/ohlazhdennye-napitki-94710000"
"https://www.ozon.ru/category/kofe-i-kakao-94672000"
"https://www.ozon.ru/category/supermarket-orehi-sneki-9355000"
)

categories=(
# "https://www.ozon.ru/highlight/produktsiya-ozon-express-199745"
"https://www.ozon.ru/category/sportivnoe-pitanie-111000000"
)

for category in "${categories[@]}"; do
    python3 ozon.py --category-url "$category" # --force-reparse --up
done

# category="${categories[0]}"

# if [ "$mode" == "url" ]; then
#     python3 ozon_parser.py --url "$url"
# elif [ "$mode" == "category" ]; then
#     python3 ozon_parser.py --category-url "$category"
# fi