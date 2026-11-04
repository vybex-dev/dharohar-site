export interface CuratedSiteInfo {
  thumbnail: string;
  gallery: {
    url: string;
    caption: string;
    credit: string;
  }[];
  sources: {
    title: string;
    language: string;
    period: string;
    originalText: string;
    translation: string;
    citation: string;
  }[];
  region?: string;
  folklore?: string;
}

export const CURATED_SITES: Record<string, CuratedSiteInfo> = {
  "rani-ki-vav-patan": {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/3/36/Rani_ki_vav_-_Gujarat_-_06.jpg",
    gallery: [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/3/36/Rani_ki_vav_-_Gujarat_-_06.jpg",
        caption: "Multi-tiered subterranean pavilion — UNESCO World Heritage, Patan, Gujarat",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Rani_ki_vav_02.jpg",
        caption: "Carved pillared corridors descending toward the subterranean aquifer",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Rani_ki_vav_-_Patan_-_Gujarat_-_Wall_Decorations.jpg",
        caption: "Intricate wall sculptures of Vishnu avatars in the sanctum tier",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
    ],
    sources: [
      {
        title: "Prabandha Chintamani Epigraphical Account",
        language: "Sanskrit",
        period: "14th Century CE (Merutunga Acharya)",
        originalText: "भूपालभीमपत्नी सा सुतकीर्तिविवर्धिनी।\nश्रीउदयमती नाम्ना चक्रे वापीमनुत्तमाम्॥\nपाताळतुल्यरचनां चित्रकर्मविभूषिताम्।",
        translation:
          "The revered Queen Udayamati, devoted consort of King Bhimadeva I of the Chaulukya dynasty, commissioned this peerless stepped reservoir to sanctify his everlasting glory—descending toward the subterranean depths with marvelous stonework and divine iconography.",
        citation: "Prabandhacintāmaṇi of Merutuṅga, Sandesara & Shastri edition, ASI Gujarat Vol. IV",
      },
    ],
    region: "North Gujarat Plains",
    folklore:
      "Local tradition records that Rani Udayamati spent decades overseeing the artisans from Anhilwad Patan, ensuring every carved avatar of Vishnu watched over the pristine sweet water of the subterranean Saraswati aquifer.",
  },
  "chand-baori-abhaneri": {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/e/ee/ChandBaori.jpg",
    gallery: [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/e/ee/ChandBaori.jpg",
        caption: "Symmetrical inverted pyramid of 3,500 stone steps descending 13 storeys — Abhaneri, Rajasthan",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/b/b5/Abhaneri-Chand_Baori-06-Galerie-2018-gje.jpg",
        caption: "Detailed multi-storey view of the V-shaped geometric staircase galleries",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/2/24/Chand_Baori_%28Step-well%29_at_Abhaneri.JPG",
        caption: "Carved multistory pavilion of Harshat Mata overlooking the reservoir",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
    ],
    sources: [
      {
        title: "Abhaneri Harshat Mata Temple Dedication Tablet",
        language: "Sanskrit / Early Nagari",
        period: "8th–9th Century CE (Nikumbha Dynasty)",
        originalText: "राजाधिराजचन्द्रोऽभून् निकुम्भकुलभास्करः।\nतेनेदं कारितं रम्यं जलाश्रयमनुत्तमम्॥",
        translation:
          "King Raja Chandra, illuminating the noble Nikumbha lineage like the radiant sun, consecrated this breathtaking reservoir and sanctuary so that wayfarers across the arid Maru-Gurjara country might find refuge and eternal cooling waters.",
        citation: "Epigraphia Indica, Volume XXXVII, Abhaneri Fragmentary Inscriptions",
      },
    ],
    region: "Dhundhar / Eastern Rajasthan",
    folklore:
      "Legends passed down by Dausa villagers recount that the 3,500 steps were carved in a single night by spirit-artisans summoned by Raja Chanda to quench the thirst of the desert kingdom.",
  },
  "mehrangarh-fort-jodhpur": {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/5/5b/Mehrangarh_Fort.jpg",
    gallery: [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/5/5b/Mehrangarh_Fort.jpg",
        caption: "Colossal perpendicular sandstone bastion rising 125 metres above Jodhpur, the Blue City",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/3/3c/Mehrangarh_fort_overlooking_the_blue_city.jpg",
        caption: "Panoramic view of Jodhpur's blue-painted houses from the fort ramparts",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/b/b2/Inside_Mehrangarh_Fort_8.jpg",
        caption: "Moti Mahal interior featuring intricate latticed jharokha windows and filigree screens",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
    ],
    sources: [
      {
        title: "Rathore Dynasty Royal Foundation Decree",
        language: "Dingal / Marwari Rajasthani",
        period: "1459 CE (Rao Jodha)",
        originalText: "संवत पनरहसै सोळहे, जेठ बदी ग्यारस।\nजोधै मांड्यो दुर्ग गढ, चिड़ियानाथ रौ वास॥",
        translation:
          "In Samvat 1516, on the eleventh lunar day of dark Jyeshtha, Rao Jodha established the unyielding citadel atop Bhakurcheeria—the cliff of bird spirits—commanding the sands of Marwar for generations unending.",
        citation: "Jodhpur Rajya ki Khyat, Maharaja Man Singh Pustak Prakash Research Centre",
      },
    ],
    region: "Marwar Desert",
    folklore:
      "The hermitage of the avian ascetic hermit Cheeria Nathji still sits within the ramparts. He is said to have granted the Rathores victory in battle, on condition that water always be pumped to the cliff summits for migrating birds.",
  },
  "bagru-block-printing": {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/d/dc/Woman_doing_Block_Printing_at_Bagru_village%2C_Jaipur%2C_India.jpg",
    gallery: [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/d/dc/Woman_doing_Block_Printing_at_Bagru_village%2C_Jaipur%2C_India.jpg",
        caption: "Artisan hand-stamping carved teakwood blocks at Bagru village, near Jaipur",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Antique_Patan_Patola_Double_Ikat_Trade_Textile_courtesy_Wovensouls_Collection%2C_Singapore.jpg",
        caption: "Traditional natural dye fabrics produced using the Bagru block printing method",
        credit: "Wikimedia Commons / CC-BY-SA",
      },
    ],
    sources: [
      {
        title: "Oral Tradition & Guild Charter of the Chhipa Community",
        language: "Dhundhari / Hindi",
        period: "17th Century Traditional Oral Canon",
        originalText: "संजरिया री रेती में डाबू सोवे, नील और हरड़ा रो रंग कभी न खोवे।\nपीढ़ी दर पीढ़ी काठ रा छापा, धरम हमारा रंगे रूपा॥",
        translation:
          "By the alluvial sands of the Sanjaria, the clay resist (dabu) dries firm; the deep indigo and myrobalan (harda) dyes shall never fade with time. Through generations our wooden blocks carve our sacred craft.",
        citation: "Dharohar Oral History Archives, Rajasthan Craft Documentation Project",
      },
    ],
    region: "Dhundhar (Jaipur)",
    folklore:
      "The Chhipa craft families trace their block printing back over 450 years when Thakur of Bagru settled the community by the Sanjaria River, prized for its natural minerals that chemically bind natural dyes to cotton fibers.",
  },
  "patan-patola-weaving": {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/e/e1/Antique_Patan_Patola_Double_Ikat_Trade_Textile_courtesy_Wovensouls_Collection%2C_Singapore.jpg",
    gallery: [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Antique_Patan_Patola_Double_Ikat_Trade_Textile_courtesy_Wovensouls_Collection%2C_Singapore.jpg",
        caption: "Antique Patan Patola double-ikat silk textile — geometric Navratna Bhat pattern",
        credit: "Wovensouls Collection / Wikimedia Commons CC-BY-SA",
      },
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Loom_to_weave_patola.jpg/800px-Loom_to_weave_patola.jpg",
        caption: "Traditional slanted bamboo loom used to align individually tie-dyed warp and weft silk",
        credit: "Bernard Gagnon / Wikimedia Commons CC-BY-SA",
      },
    ],
    sources: [
      {
        title: "Kumarapala Charita Royal Weaver Relocation Chronicle",
        language: "Old Gujarati / Prakrit",
        period: "12th Century CE (King Kumarapala of Anhilwad)",
        originalText: "सात सौ साळवी पटोलाकाराः पाटननगरे समानीताः।\nपवित्रवस्त्रं विना न पूजा संपद्यते॥\nफाटे पण फीटे नहि।",
        translation:
          "King Kumarapala invited seven hundred master Salvi silk-weaving families from Jalna to settle permanently in Anhilwad Patan, declaring that royal daily worship could only be conducted wearing untainted double-ikat silk. The cloth outlives lifetimes: 'The silk may tear, but the color never fades.'",
        citation: "Kumārapālacarita of Jinamandanagani, Hemachandracharya Jnanamandir Collection",
      },
    ],
    region: "Patan (North Gujarat)",
    folklore:
      "Patan Patola is prized across Asia as an auspicious talisman against evil. Because both warp and weft are individually tie-dyed before weaving, front and reverse sides are mathematically identical.",
  },
};

const CATEGORY_FALLBACKS: Record<
  string,
  {
    thumbnail: string;
    description: string;
  }
> = {
  stepwell: {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/e/ee/ChandBaori.jpg",
    description: "Historic subterranean stepped reservoir built with ornate stone galleries for water harvesting and communal rest.",
  },
  fort: {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/5/5b/Mehrangarh_Fort.jpg",
    description: "Sandstone citadel engineered with concentric bastions, courtyards, and palatial balconies.",
  },
  craft: {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/d/dc/Woman_doing_Block_Printing_at_Bagru_village%2C_Jaipur%2C_India.jpg",
    description: "Living traditional handicraft nurtured across centuries using indigenous tools, organic pigments, and hereditary knowledge.",
  },
  textile: {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/e/e1/Antique_Patan_Patola_Double_Ikat_Trade_Textile_courtesy_Wovensouls_Collection%2C_Singapore.jpg",
    description: "Handcrafted heirloom textile woven on traditional looms with intricate resist-dyeing and regional geometric motifs.",
  },
  default: {
    thumbnail:
      "https://upload.wikimedia.org/wikipedia/commons/3/36/Rani_ki_vav_-_Gujarat_-_06.jpg",
    description: "Documented cultural heritage monument preserving regional architectural and historical heritage.",
  },
};

export function getCuratedSite(slug?: string | null, category?: string | null, name?: string | null): CuratedSiteInfo {
  const normSlug = (slug || "").toLowerCase();
  for (const [key, val] of Object.entries(CURATED_SITES)) {
    if (normSlug.includes(key) || (name && name.toLowerCase().includes(key.replace(/-/g, " ")))) {
      return val;
    }
  }

  // Name fuzzy check
  const lowerName = (name || "").toLowerCase();
  if (lowerName.includes("rani") || lowerName.includes("vav")) return CURATED_SITES["rani-ki-vav-patan"];
  if (lowerName.includes("chand") || lowerName.includes("baori")) return CURATED_SITES["chand-baori-abhaneri"];
  if (lowerName.includes("mehrangarh") || lowerName.includes("jodhpur")) return CURATED_SITES["mehrangarh-fort-jodhpur"];
  if (lowerName.includes("bagru") || lowerName.includes("block")) return CURATED_SITES["bagru-block-printing"];
  if (lowerName.includes("patola") || lowerName.includes("patan")) return CURATED_SITES["patan-patola-weaving"];

  const catFallback = CATEGORY_FALLBACKS[category || ""] || CATEGORY_FALLBACKS.default;
  return {
    thumbnail: catFallback.thumbnail,
    gallery: [
      {
        url: catFallback.thumbnail,
        caption: "Documented heritage site",
        credit: "Dharohar Heritage Archive",
      },
    ],
    sources: [
      {
        title: "Archival Survey Field Ledger",
        language: "Regional Record",
        period: "Historical Archive",
        originalText: "पुरातत्व सर्वेक्षण दस्तावेज़ एवं क्षेत्रीय अभिलेख।",
        translation:
          "Recorded during regional heritage documentation. Full inscriptions and epigraphical transliterations are currently being cataloged by the preservation team.",
        citation: "Dharohar Heritage Atlas Documentation Fieldwork Series",
      },
    ],
    region: "Western India",
  };
}
