package com.graboguessr.capture

data class Spot(val stop: Int, val name: String, val lat: Double, val lng: Double)

val HOME = Spot(0, "Home", 57.8645285, 12.3209907)

// Same spots, same order, as the web route planner (route_from_home.csv).
val SPOTS: List<Spot> = listOf(
    Spot(1, "Aggetorpsvägen busshållplats", 57.843612, 12.29175),
    Spot(2, "Vedmästarna Grusvägen", 57.843014, 12.291875),
    Spot(3, "Aggetorpsvägen north (Aggetorpsvägen 18)", 57.842304, 12.294213),
    Spot(4, "Lekstorpsskolan", 57.841575, 12.294351),
    Spot(5, "Aggetorpsvägen south (Monvägen 110B)", 57.840435, 12.293835),
    Spot(6, "Sportvägen (Monvägen 106)", 57.839825, 12.292647),
    Spot(7, "Lekstorps IF idrottspark", 57.840754, 12.290768),
    Spot(8, "Preem Gråbo", 57.841902, 12.288895),
    Spot(9, "Gulf Gråbo (Gråbo Industriväg 3)", 57.841064, 12.286175),
    Spot(10, "Gråbo industriområde", 57.840159, 12.288093),
    Spot(11, "Evolution Shop", 57.839498, 12.288103),
    Spot(12, "Ljungviksskolan", 57.834845, 12.287196),
    Spot(13, "Ljungviksvägen (Gråbo Hed 11)", 57.833652, 12.28938),
    Spot(14, "Lekstorpsvägen south (Heden 2)", 57.832485, 12.287136),
    Spot(15, "Bäckamadens Förskola", 57.833472, 12.28729),
    Spot(16, "Lekstorpsvägen north (Bäckamaden 5)", 57.834076, 12.28762),
    Spot(17, "Ljungviksskolan annex", 57.83432, 12.28599),
    Spot(18, "Västra Gråbo residential (Bäckamaden 27B)", 57.831993, 12.280118),
    Spot(19, "Bäckamaden road (Bäckamaden 44)", 57.830231, 12.274788),
    Spot(20, "Monvägen west (Bäckamaden 47)", 57.829304, 12.274108),
    Spot(21, "Kyrkvägen south (Gråbovägen (street))", 57.82613, 12.292036),
    Spot(22, "Södra Gråbo residential (Gråbovägen (street) 2)", 57.826996, 12.29147),
    Spot(23, "Stora Lundby kyrka", 57.828432, 12.293632),
    Spot(24, "Kyrkvägen north (Lundbyvägen (street))", 57.829914, 12.293261),
    Spot(25, "Lundbyvägen south (Ekdungen 6)", 57.83353, 12.29696),
    Spot(26, "Röselidsvägen west (Röselidskullen 6)", 57.833714, 12.300708),
    Spot(27, "Röselidsskolan", 57.834139, 12.302767),
    Spot(28, "Röselidsvägen east (Giggvägen 30)", 57.834042, 12.304722),
    Spot(29, "Östra Gråbo residential (Betesvägen 19)", 57.835827, 12.305067),
    Spot(30, "Hjällsnäshallen", 57.835616, 12.301515),
    Spot(31, "Nya Lundbygården", 57.834641, 12.298088),
    Spot(32, "Närhälsan vårdcentral", 57.835217, 12.297077),
    Spot(33, "Curry King", 57.836137, 12.296884),
    Spot(34, "Coop Mjörnbotorget", 57.83583, 12.298859),
    Spot(35, "Gråbo bibliotek", 57.836385, 12.300017),
    Spot(36, "Gråbo busstation", 57.836804, 12.298361),
    Spot(37, "Lundbyvägen north (Erik Jonsvägen 5)", 57.837551, 12.297896),
    Spot(38, "Mjörnbo Allé north (Hjällsnäsvägen 21)", 57.837353, 12.300166),
    Spot(39, "Monvägen east (Segerstadsvägen 9I)", 57.839153, 12.299791),
    Spot(40, "Lilla Kiosken", 57.840397, 12.298063),
)

private const val EARTH_RADIUS_M = 6371000.0

fun haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val dLat = Math.toRadians(lat2 - lat1)
    val dLng = Math.toRadians(lng2 - lng1)
    val sinLat = Math.sin(dLat / 2)
    val sinLng = Math.sin(dLng / 2)
    val a = sinLat * sinLat +
        Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * sinLng * sinLng
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** The closest of the 50 photo spots to a given fix, with the distance in meters. */
fun nearestSpot(lat: Double, lng: Double): Pair<Spot, Double> =
    SPOTS.map { it to haversineMeters(lat, lng, it.lat, it.lng) }.minByOrNull { it.second }!!
