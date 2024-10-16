import React, { useState } from "react";
import Plot from "react-plotly.js";
import { BounceLoader } from "react-spinners"; // Import the spinner
import sp500Json from "./sp500_tickers.json";
import GeoChart from "./map.js";

const industries = [
  ...new Set(
    Object.entries(sp500Json).map(([ticker, info]) => info["GICS Sector"])
  ),
];

const timePeriods = [
  "1 day",
  "5 days",
  "1 month",
  "3 months",
  "6 months",
  "1 year",
  "2 years",
  "5 years",
  "10 years",
  "Year to date",
  "All time",
];

function App() {
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [timePeriod, setTimePeriod] = useState("");
  const [stockData, setStockData] = useState(null); // State for stock data
  const [stockValuation, setStockValuation] = useState(null); // State for stock valuation
  const [stockDataPlot, setStockDataPlot] = useState(null);
  const [forecastPlot, setForecastPlot] = useState(null);
  const [companyPlot, setCompanyPlot] = useState(null);
  const [industryPEPlot, setIndustryPEPlot] = useState(null);
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(false);
  const orderedKeys = [
    "Company Summary",
    "Address",
    "Full-time Employees",
    "Audit Risk",
    "Board Risk",
    "Compensation Risk",
    "Shareholder Rights Risk",
    "Overall Risk",
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/stock-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          industry,
          company,
          time_period: timePeriod,
        }),
      });

      if (!response.ok) {
        throw new Error("Error fetching stock data");
      }

      const data = await response.json();

      setStockData(data);
      setCompanyPlot(JSON.parse(data["monetary_plot"]));
      setForecastPlot(JSON.parse(data["forecast_plot"]));
      setIndustryPEPlot(JSON.parse(data["industry_plot"]));
      setStockDataPlot(JSON.parse(data["plot"]));

      // news
      const newsResponse = await fetch("/api/news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          industry,
          company,
          time_period: timePeriod,
        }),
      });

      if (!newsResponse.ok) {
        throw new Error("Error fetching stock data");
      }

      const newsData = await newsResponse.json();
      setNews(newsData);
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setLoading(false);
    }

    try {
      const response = await fetch("/api/stock-valuation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ company }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch stock valuation");
      }

      const data = await response.json();
      setStockValuation(data);
    } catch (error) {
      setStockValuation(null);
      console.error("Error fetching stock valuation:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.app}>
      <h1 style={styles.header}>Stock Data Viewer</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Industry:</label>
          <select
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value);
              setCompany("");
              setStockData(null);
              setNews(null);
            }}
            style={styles.select}
          >
            <option value="">Select Industry</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Company:</label>
          <select
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setStockData(null);
              setNews(null);
            }}
            disabled={!industry}
            style={styles.select}
          >
            <option value="">Select Company</option>
            {Object.entries(sp500Json)
              .filter(([ticker, data]) => data["GICS Sector"] === industry) // Filter by industry
              .map(([ticker, data]) => (
                <option key={ticker} value={ticker}>
                  {data["Security"]}
                </option>
              ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Time Period:</label>
          <select
            value={timePeriod}
            onChange={(e) => {
              setTimePeriod(e.target.value);
              setStockData(null);
              setNews(null);
            }}
            style={styles.select}
          >
            <option value="">Select Time Period</option>
            {timePeriods.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </div>
        <button
          variant="contained"
          color="primary"
          type="submit"
          disabled={timePeriod === "" || industry === "" || company === ""}
          style={
            timePeriod === "" || industry === "" || company === ""
              ? styles.buttonDisabled
              : styles.button
          }
        >
          Get Data
        </button>
      </form>

      {loading && (
        <div style={styles.loader}>
          <BounceLoader color="#007bff" loading={loading} size={50} />
        </div>
      )}

      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
        {news && (
          <div
            style={{
              maxWidth: "800px",
              margin: "0 auto",
              backgroundColor: "#f9f9f9",
              padding: "20px",
              borderRadius: "10px",
              boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
            }}
          >
            {/* Render average sentiment score and category */}
            <div
              style={{
                padding: "15px",
                marginBottom: "20px",
                backgroundColor: "#fff",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
              }}
            >
              <h2 style={{ margin: "0", color: "#333" }}>
                News Sentiment Overview
              </h2>
              <p style={{ fontSize: "18px", margin: "10px 0" }}>
                <span style={{ fontWeight: "bold", color: "#546e7a" }}>
                  Sentiment Score:
                </span>
                <span
                  style={{
                    fontSize: "20px",
                    color: "#546e7a",
                    marginLeft: "10px",
                  }}
                >
                  {news.average_sentiment_score}
                </span>
              </p>
              <p style={{ fontSize: "18px", margin: "10px 0" }}>
                <span style={{ fontWeight: "bold", color: "#546e7a" }}>
                  Sentiment Category:
                </span>
                <span
                  style={{
                    fontSize: "20px",
                    color: "#546e7a",
                    marginLeft: "10px",
                  }}
                >
                  {news.avg_sentiment_category}
                </span>
              </p>
            </div>

            {/* Map through top_news */}
            <div>
              {Object.keys(news.top_news).map((key) => (
                <div
                  key={key}
                  style={{
                    padding: "15px",
                    marginBottom: "20px",
                    backgroundColor: "#fff",
                    borderRadius: "8px",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  <h3
                    style={{
                      marginBottom: "10px",
                      color: "#333",
                      textAlign: "left",
                    }}
                  >
                    {news.top_news[key].title}
                  </h3>
                  <p
                    style={{
                      fontSize: "16px",
                      lineHeight: "1.6",
                      color: "#555",
                      textAlign: "left",
                    }}
                  >
                    {news.top_news[key].text}
                  </p>
                  <a
                    href={news.top_news[key].news_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      marginTop: "10px",
                      fontSize: "16px",
                      color: "#007BFF",
                      textDecoration: "none",
                    }}
                  >
                    Read more &rarr;
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {stockData && (
        <div style={styles.resultContainer}>
          <h2 style={styles.resultHeader}>{stockData.company} Overview</h2>
          <div sx={{ display: "flex", flexDirection: "col" }}>
            <div style={{ marginBottom: "20px" }}>
              {timePeriod !== "1 day" && (
                <>
                  <Plot
                    data={stockDataPlot.data}
                    layout={stockDataPlot.layout}
                  />
                  <div>
                    <Plot
                      data={forecastPlot.data}
                      layout={forecastPlot.layout}
                    />
                  </div>
                </>
              )}
            </div>
            <div>
              <Plot data={industryPEPlot.data} layout={industryPEPlot.layout} />
            </div>
            <div>
              <Plot data={companyPlot.data} layout={companyPlot.layout} />
            </div>
          </div>
          <div style={styles.infoContainer}>
            <h3 style={styles.infoHeader}>Summary Data</h3>
            <ul style={styles.list}>
              {Object.entries(stockData.summary_data).map(([key, value]) => (
                <li key={key} style={styles.listItem}>
                  {key}: {value}
                </li>
              ))}
            </ul>
          </div>
          <div style={styles.infoContainer}>
            <h3 style={styles.infoHeader}>Company Info</h3>
            {stockData["info"]["Company Logo"] && (
              <div style={{ marginBottom: "10px" }}>
                <img
                  src={stockData["info"]["Company Logo"]}
                  alt="Company Logo"
                  style={{ width: "200px", height: "200px" }} // Adjust size as needed
                />
              </div>
            )}
            <ul style={styles.list}>
              {orderedKeys.map(
                (key) =>
                  stockData.info[key] !== undefined && (
                    <li key={key} style={styles.listItem}>
                      {key}: {stockData.info[key]}
                    </li>
                  )
              )}
            </ul>
            <GeoChart
              sx={{ marginBottom: 0 }}
              state={
                stockData.info["Address"]
                  .split(",")[2]
                  .trim()
                  .split(" ")
                  .slice(-2, -1)[0]
              }
            />
          </div>

          {stockValuation && (
            <div style={styles.infoContainer}>
              <h3 style={styles.infoHeader}>Valuation Details</h3>
              <ul style={styles.list}>
                <li>Company Name: {stockValuation["Company Name"]}</li>
                <li>Sector: {stockValuation.Sector}</li>
                <li>
                  Enterprise Value (Millions):{" "}
                  {stockValuation["Enterprise Value (Millions)"]}
                </li>
                <li>
                  Net Debt (Millions): {stockValuation["Net Debt (Millions)"]}
                </li>
                <li>
                  Equity Value (Millions):{" "}
                  {stockValuation["Equity Value (Millions)"]}
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    fontFamily: "Arial, sans-serif",
    maxWidth: "800px",
    margin: "0 auto",
    padding: "20px",
    textAlign: "center",
    backgroundColor: "#f9f9f9",
    borderRadius: "8px",
    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
  },
  header: {
    color: "#333",
    marginBottom: "20px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  formGroup: {
    marginBottom: "15px",
    width: "100%",
  },
  label: {
    display: "block",
    marginBottom: "5px",
    fontWeight: "bold",
  },
  select: {
    width: "100%",
    padding: "10px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    fontSize: "16px",
  },
  button: {
    margin: "0.5em",
    padding: "10px 20px",
    borderRadius: "4px",
    border: "none",
    backgroundColor: "#007bff",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
    transition: "background-color 0.3s",
  },
  buttonDisabled: {
    margin: "0.5em",
    padding: "10px 20px",
    borderRadius: "4px",
    border: "none",
    color: "#fff",
    fontSize: "16px",
    transition: "background-color 0.3s",
    backgroundColor: "#ccc",
    cursor: "not-allowed",
  },
  resultContainer: {
    position: "relative",
    marginTop: "20px",
    textAlign: "left",
    padding: "20px",
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0 2px 5px rgba(0, 0, 0, 0.1)",
  },
  resultHeader: {
    marginBottom: "10px",
    fontSize: "20px",
    fontWeight: "bold",
  },
  plotContainer: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "15px",
  },
  infoContainer: {
    marginTop: "15px",
    padding: "15px",
    borderRadius: "8px",
    backgroundColor: "#f0f8ff", // Light blue background for info sections
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  infoHeader: {
    marginBottom: "10px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#007bff", // Bootstrap primary color
  },
  list: {
    listStyleType: "none",
    padding: "0",
  },
  listItem: {
    marginBottom: "8px",
    fontSize: "16px",
  },
  loader: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    zIndex: 1000,
  },
};

export default App;
