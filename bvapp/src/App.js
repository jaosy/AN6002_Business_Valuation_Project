import React, { useState } from "react";
import Plot from "react-plotly.js";
import { BounceLoader } from "react-spinners";
import sp500Json from "./sp500_tickers.json";
import GeoChart from "./map.js";
import { Tooltip } from "react-tooltip";
import styled, { keyframes } from "styled-components";

const marqueeAnimation = keyframes`
  0% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(-100%);
  }
`;

const MarqueeContainer = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  overflow: hidden;
  background: linear-gradient(135deg, #74c0ff, #2a70c8);
  padding: 10px 0;
  box-shadow: 0 -2px 5px rgba(0, 0, 0, 0.1);
`;

const MarqueeContent = styled.div`
  display: inline-block;
  white-space: nowrap;
  animation: ${marqueeAnimation} 20s linear infinite;

  span {
    display: inline-block;
    padding: 0 50px;
    font-size: 18px;
    font-weight: bold;
    color: #ffffff;
  }
`;

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
  const [stockData, setStockData] = useState(null);
  const [stockValuation, setStockValuation] = useState(null);
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

  const getTooltipForKey = (key) => {
    switch (key) {
      case "Current Price":
        return "The current trading price of a single share of the company's stock.";
      case "EBITDA":
        return "Earnings Before Interest, Taxes, Depreciation, and Amortization - a measure of a company's overall financial performance.";
      case "EPS":
        return "Earnings Per Share - the portion of a company's profit allocated to each outstanding share of common stock.";
      case "End Cash Position":
        return "The amount of cash the company has on hand at the end of a reporting period.";
      case "Gross Profit":
        return "Revenue minus the cost of goods sold.";
      case "High":
        return "The highest price at which a security traded during a period.";
      case "Low":
        return "The lowest price at which a security traded during a period.";
      case "Market Cap":
        return "Market Capitalization - the total value of all a company's outstanding shares.";
      case "P/E Ratio":
        return "Price-to-Earnings Ratio - the ratio of the market price per share to earnings per share.";
      case "Pre-tax Income":
        return "A company's income after deducting expenses but before accounting for income tax.";
      case "Total Assets":
        return "The sum of all assets owned by a company.";
      case "Total Liabilities":
        return "The sum of all a company's debts and obligations.";
      case "Enterprise Value":
        return "The total value of a company, including both its equity and debt. It represents the theoretical takeover price.";
      case "Net Debt":
        return "A company's total debt minus any cash and cash equivalents it has on hand.";
      case "Equity Value":
        return 'The value of the company available to its shareholders (total assets minus total liabilities). Often referred to as "market cap" for publicly traded companies.';
      case "Audit Risk":
        return "This assesses the quality of the company’s financial reporting and internal controls, focusing on whether audits are conducted thoroughly and transparently.";
      case "Board Risk":
        return "This evaluates the structure and effectiveness of the board of directors, including its independence, diversity, and oversight.";
      case "Shareholder Rights Risk":
        return "This examines how well the company protects and upholds shareholder rights, such as voting rights and the ability to influence key decisions.";
      case "Compensation Risk":
        return "This focuses on executive compensation practices, looking at whether pay is aligned with performance and if there are excessive or unfair compensation packages.";
      case "Overall Risk":
        return "Overall governance risk is a key factor that affects a company’s reputation, operational efficiency, financial performance, and attractiveness to stakeholders.";
      default:
        return ``;
    }
  };

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

  const getRiskGradient = (riskValue) => {
    if (riskValue <= 3) {
      return {
        background: "linear-gradient(45deg, #28a745, #d4edda)",
        color: "#155724",
      };
    } else if (riskValue <= 7) {
      return {
        background: "linear-gradient(45deg, #007bff, #cce5ff)",
        color: "#004085",
      };
    } else {
      return {
        background: "linear-gradient(45deg, #dc3545, #f8d7da)",
        color: "#721c24",
      };
    }
  };

  const getRiskContainerStyle = (riskValue) => {
    const gradientStyle = getRiskGradient(riskValue);
    return {
      ...styles.overallRiskContainer,
      ...gradientStyle,
    };
  };

  const getRiskValueContainerStyle = (riskValue) => {
    const gradientStyle = getRiskGradient(riskValue);
    return {
      ...styles.overallRiskValueContainer,
      background: gradientStyle.background,
    };
  };

  return (
    <div style={styles.app}>
      <div style={styles.headerContainer}>
        <h1 style={styles.header}>
          <span style={styles.headerText}>Esti</span>
          <span style={styles.headerHighlight}>Mate</span>
        </h1>
      </div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label
            style={styles.label}
            data-tip="Choose a company from the selected industry."
          >
            Industry
          </label>
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
          <label style={styles.label}>Company</label>
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
              .filter(([ticker, data]) => data["GICS Sector"] === industry)
              .map(([ticker, data]) => (
                <option key={ticker} value={ticker}>
                  {data["Security"]}
                </option>
              ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Time Period</label>
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
          type="submit"
          disabled={timePeriod === "" || industry === "" || company === ""}
          style={
            timePeriod === "" || industry === "" || company === ""
              ? styles.buttonDisabled
              : styles.button
          }
        >
          Valuate Me
        </button>
      </form>

      {loading && (
        <div style={styles.loader}>
          <BounceLoader color="#007bff" loading={loading} size={50} />
        </div>
      )}

      <div style={styles.contentContainer}>
        <div style={styles.column}>
          {stockData && (
            <div style={styles.resultContainer}>
              <h2 style={styles.resultHeader}>{stockData.company} Overview</h2>
              <div style={styles.resultColumns}>
                <div style={styles.resultColumn}>
                  <div style={styles.plotsContainer}>
                    <div style={styles.plotWrapper}>
                      {timePeriod !== "1 day" && (
                        <>
                          <Plot
                            data={stockDataPlot.data}
                            layout={stockDataPlot.layout}
                            style={styles.plot}
                          />
                          <Plot
                            data={forecastPlot.data}
                            layout={forecastPlot.layout}
                            style={styles.plot}
                          />
                        </>
                      )}
                      <Plot
                        data={industryPEPlot.data}
                        layout={industryPEPlot.layout}
                        style={styles.industryPlot}
                      />
                      <Plot
                        data={companyPlot.data}
                        layout={companyPlot.layout}
                        style={styles.industryPlot}
                      />
                    </div>
                  </div>
                </div>
                <div style={styles.resultColumn}>
                  <div style={styles.infoContainer}>
                    <h3 style={styles.infoHeader}>Company Info</h3>
                    <div style={styles.logoAndMapContainer}>
                      {stockData["info"]["Company Logo"] && (
                        <div style={styles.logoContainer}>
                          <img
                            src={stockData["info"]["Company Logo"]}
                            alt="Company Logo"
                            style={styles.logo}
                          />
                        </div>
                      )}
                      {stockData.info["Address"].includes("United States") && (
                        <div style={styles.mapContainer}>
                          <GeoChart
                            state={
                              stockData.info["Address"]
                                .split(",")[2]
                                .trim()
                                .split(" ")
                                .slice(-2, -1)[0]
                            }
                          />
                        </div>
                      )}
                    </div>
                    <ul style={styles.list}>
                      {orderedKeys.map((key) =>
                        stockData.info[key] !== undefined ? (
                          <li
                            key={key}
                            style={
                              key === "Overall Risk"
                                ? styles.overallRiskItem
                                : styles.listItem
                            }
                            data-tooltip-id="tooltip"
                            data-tooltip-content={getTooltipForKey(key)}
                          >
                            {key === "Overall Risk" ? (
                              <div
                                style={getRiskContainerStyle(
                                  parseFloat(stockData.info[key])
                                )}
                              >
                                <strong style={styles.overallRiskLabel}>
                                  {key}
                                </strong>
                                <div
                                  style={getRiskValueContainerStyle(
                                    parseFloat(stockData.info[key])
                                  )}
                                >
                                  <span style={styles.overallRiskValue}>
                                    {stockData.info[key]}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <strong>{key}</strong>: {stockData.info[key]}
                              </>
                            )}
                          </li>
                        ) : null
                      )}
                    </ul>
                  </div>

                  <div style={styles.infoContainer}>
                    <h3 style={styles.infoHeader}>Summary Data</h3>
                    <ul style={styles.list}>
                      {Object.entries(stockData.summary_data).map(
                        ([key, value]) => (
                          <li
                            key={key}
                            style={styles.listItem}
                            data-tooltip-id="tooltip"
                            data-tooltip-content={getTooltipForKey(key)}
                          >
                            <strong>{key}</strong>: {value}
                          </li>
                        )
                      )}
                      <Tooltip
                        id="tooltip"
                        place="left"
                        type="dark"
                        effect="solid"
                        style={{
                          padding: "8px 12px",
                          borderRadius: "4px",
                          fontSize: "20px",
                          maxWidth: "200px",
                          whiteSpace: "normal",
                          textAlign: "center",
                          wordWrap: "break-word",
                        }}
                      />
                    </ul>
                  </div>

                  {stockValuation && (
                    <div style={styles.infoContainer}>
                      <h3 style={styles.infoHeader}>Valuation Details</h3>
                      <ul style={styles.list}>
                        <li style={styles.listItem}>
                          <strong>Company Name</strong>:{" "}
                          {stockValuation["Company Name"]}
                        </li>
                        <li style={styles.listItem}>
                          <strong>Sector</strong>: {stockValuation.Sector}
                        </li>
                        <li
                          style={styles.listItem}
                          data-tooltip-id="tooltip"
                          data-tooltip-content={getTooltipForKey(
                            "Enterprise Value"
                          )}
                        >
                          <strong>Enterprise Value (Millions)</strong>:{" "}
                          {stockValuation["Enterprise Value (Millions)"]}
                        </li>
                        <li
                          style={styles.listItem}
                          data-tooltip-id="tooltip"
                          data-tooltip-content={getTooltipForKey("Net Debt")}
                        >
                          <strong>Net Debt (Millions)</strong>:{" "}
                          {stockValuation["Net Debt (Millions)"]}
                        </li>
                        <li
                          style={styles.listItem}
                          data-tooltip-id="tooltip"
                          data-tooltip-content={getTooltipForKey(
                            "Equity Value"
                          )}
                        >
                          <strong>Equity Value (Millions)</strong>:{" "}
                          {stockValuation["Equity Value (Millions)"]}
                        </li>
                        <Tooltip
                          id="tooltip"
                          place="left"
                          type="dark"
                          effect="solid"
                          style={{
                            padding: "8px 12px",
                            borderRadius: "4px",
                            fontSize: "20px",
                            maxWidth: "200px",
                            whiteSpace: "normal",
                            textAlign: "center",
                            wordWrap: "break-word",
                          }}
                        />
                      </ul>
                    </div>
                  )}

                  <div style={styles.column}>
                    {news && (
                      <div style={styles.newsContainer}>
                        <div style={styles.newsSentimentOverview}>
                          <h2 style={styles.newsHeader}>
                            News Sentiment Overview
                          </h2>
                          <p style={styles.newsSentimentText}>
                            <span style={styles.newsSentimentLabel}>
                              Sentiment Score:
                            </span>
                            <span style={styles.newsSentimentValue}>
                              {news.average_sentiment_score}
                            </span>
                          </p>
                          <p style={styles.newsSentimentText}>
                            <span style={styles.newsSentimentLabel}>
                              Sentiment Category:
                            </span>
                            <span style={styles.newsSentimentValue}>
                              {news.avg_sentiment_category}
                            </span>
                          </p>
                        </div>

                        {Object.keys(news.top_news).map((key) => (
                          <div key={key} style={styles.newsItem}>
                            <h3 style={styles.newsTitle}>
                              {news.top_news[key].title}
                            </h3>
                            <p style={styles.newsText}>
                              {news.top_news[key].text}
                            </p>
                            <a
                              href={news.top_news[key].news_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={styles.newsLink}
                            >
                              Read more &rarr;
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <MarqueeContainer>
        <MarqueeContent>
          <span>AN6002 Group 9</span>
          <span>{stockData && stockData["company"]} </span>
          <span>
            {"Current Price: "}
            {stockData && stockData["summary_data"]["Current Price"]}{" "}
          </span>
          <span>
            {news &&
              (news.avg_sentiment_category == "Bullish"
                ? news.avg_sentiment_category + "👍"
                : news.avg_sentiment_category)}
          </span>
          <span>
            <img url="https://a.pinatafarm.com/1702x1280/5a102e3225/stonks.jpg"></img>
          </span>
        </MarqueeContent>
      </MarqueeContainer>
    </div>
  );
}

const styles = {
  app: {
    fontFamily: "Arial, sans-serif",
    margin: "0 auto",
    maxWidth: "100%",
  },
  header: {
    color: "#333",
    marginBottom: "20px",
    textAlign: "center",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    maxWidth: "400px",
    margin: "0 auto",
    padding: "30px",
    borderRadius: "10px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    backgroundColor: "#f8f9fa",
  },
  formGroup: {
    width: "100%",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "16px",
    fontWeight: "bold",
    color: "#495057",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  select: {
    width: "100%",
    padding: "12px",
    fontSize: "16px",
    borderRadius: "5px",
    border: "1px solid #ced4da",
    backgroundColor: "#fff",
    transition: "border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out",
    "&:focus": {
      borderColor: "#80bdff",
      outline: 0,
      boxShadow: "0 0 0 0.2rem rgba(0, 123, 255, 0.25)",
    },
  },
  button: {
    padding: "12px 24px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#007bff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    background: "linear-gradient(45deg, #007bff, #0056b3)",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    "&:hover": {
      background: "linear-gradient(45deg, #0056b3, #004085)",
      boxShadow: "0 6px 8px rgba(0, 0, 0, 0.15)",
    },
  },
  buttonDisabled: {
    padding: "12px 24px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#6c757d",
    backgroundColor: "#e9ecef",
    border: "none",
    borderRadius: "5px",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  contentContainer: {
    display: "flex",
    flexWrap: "wrap",
  },
  column: {
    flex: "0 0 48%",
    marginBottom: "20px",
  },
  newsContainer: {
    marginTop: "20px",
    marginBottom: "20px",
  },
  newsSentimentOverview: {
    backgroundColor: "#f0f8ff",
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "20px",
  },
  newsHeader: {
    fontSize: "20px",
    marginBottom: "10px",
    color: "#333",
  },
  newsSentimentText: {
    fontSize: "16px",
    margin: "5px 0",
  },
  newsSentimentLabel: {
    fontWeight: "bold",
    marginRight: "10px",
  },
  newsSentimentValue: {
    color: "#007bff",
  },
  newsItem: {
    backgroundColor: "#fff",
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "15px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  newsTitle: {
    fontSize: "18px",
    marginBottom: "10px",
    color: "#333",
  },
  newsText: {
    fontSize: "14px",
    lineHeight: "1.6",
    color: "#555",
  },
  newsLink: {
    display: "inline-block",
    marginTop: "10px",
    color: "#007bff",
    textDecoration: "none",
  },
  resultContainer: {
    marginBottom: "20px",
  },
  resultHeader: {
    marginBottom: "10px",
    marginLeft: "30px",
    fontSize: "20px",
    fontWeight: "bold",
  },
  resultColumns: {
    display: "flex",
    justifyContent: "space-between",
  },
  resultColumn: {
    paddingLeft: "20px",
    flex: "0 0 48%",
  },
  plotsContainer: {
    whiteSpace: "nowrap",
    maxWidth: "70%",
  },
  plotWrapper: {
    display: "inline-block",
  },
  plot: {
    marginBottom: "20px",
  },
  industryPlot: {
    marginBottom: "20px",
    maxWidth: "80%",
    overflowX: "scroll",
  },
  infoContainer: {
    marginTop: "15px",
    padding: "15px",
    borderRadius: "8px",
    backgroundColor: "#f0f8ff",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  infoHeader: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "10px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#007bff",
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
  logoAndMapContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: "20px",
    gap: "20px",
  },
  logoContainer: {
    flex: "0 0 auto",
  },
  mapContainer: {
    flex: "0 0 auto",
  },
  logo: {
    maxWidth: "150px",
    height: "auto",
  },
  overallRiskItem: {
    marginBottom: "20px",
    listStyleType: "none",
  },
  overallRiskContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px",
    borderRadius: "10px",
    boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
  },
  overallRiskLabel: {
    fontSize: "24px",
    fontWeight: "bold",
    marginBottom: "10px",
    fontFamily: "Arial, sans-serif",
  },
  overallRiskValueContainer: {
    borderRadius: "50%",
    width: "120px",
    height: "120px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
  },
  overallRiskValue: {
    fontSize: "48px",
    fontWeight: "bold",
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    color: "white",
    textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
  },
  headerContainer: {
    background: "linear-gradient(135deg, #74c0fc, #2b6cb0)",
    padding: "30px 0",
    borderRadius: "0 0 50% 50% / 20px",
    boxShadow: "0 5px 15px rgba(0, 0, 0, 0.15)",
    marginBottom: "40px",
  },
  header: {
    color: "#ffffff",
    fontSize: "48px",
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: "2px",
    textShadow: "2px 2px 4px rgba(0, 0, 0, 0.25)",
    fontFamily: '"Montserrat", "Helvetica Neue", Arial, sans-serif',
    margin: 0,
    padding: "0",
    position: "relative",
    overflow: "hidden",
  },
  headerText: {
    position: "relative",
    zIndex: 1,
  },
  headerHighlight: {
    position: "relative",
    zIndex: 1,
    display: "inline-block",
    marginLeft: "0",
    background:
      "linear-gradient(45deg, #FFB3BA, #FFDFBA, #FFFFBA, #BAFFC9, #BAE1FF)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    textShadow: "none",
    padding: "0 10px",
    borderRadius: "5px",
    "&::after": {
      content: '""',
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "5px",
      height: "10px",
      background: "rgba(255, 255, 255, 0.4)",
      zIndex: -1,
      transform: "skew(-20deg) rotate(-1deg)",
    },
    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background:
        "linear-gradient(45deg, rgba(255,179,186,0.3), rgba(255,223,186,0.3), rgba(255,255,186,0.3), rgba(186,255,201,0.3), rgba(186,225,255,0.3))",
      filter: "blur(5px)",
      zIndex: -1,
    },
  },
  marqueeContainer: {
    position: "fixed",
    bottom: 0,
    left: 0,
    width: "100%",
    overflow: "hidden",
    background: "linear-gradient(135deg, #74c0ff, #2a70c8)",
    padding: "10px 0",
    boxShadow: "0 -2px 5px rgba(0, 0, 0, 0.1)",
  },
  marquee: {
    display: "inline-block",
    whiteSpace: "nowrap",
    animation: "marquee 20s linear infinite",
    "& span": {
      display: "inline-block",
      padding: "0 50px",
      fontSize: "18px",
      fontWeight: "bold",
      color: "#ffffff",
    },
  },
};

export default App;
